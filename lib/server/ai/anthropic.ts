import "server-only";
/** Adaptador Claude (Messages API, SDK oficial). Prompt de sistema cacheado, tools estrictas, fallback de servidor. */
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaFor, strictSchema, type ChatItem } from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "./prompt";
import { ProviderError, type ProviderInput, type ProviderResult } from "./types";

export const anthropicModel = () => process.env.AI_MODEL || "claude-opus-5-5";
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];

type Msg = Anthropic.Beta.BetaMessageParam;

export function toAnthropicMessages(items: ChatItem[]): Msg[] {
  const out: Msg[] = [];
  for (const it of items) {
    if (it.role === "user") out.push({ role: "user", content: it.text });
    else if (it.role === "assistant") {
      if (it.provider === "anthropic" && Array.isArray(it.raw)) out.push({ role: "assistant", content: it.raw as Anthropic.Beta.BetaContentBlockParam[] });
      else {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (it.text) content.push({ type: "text", text: it.text });
        for (const c of it.toolCalls) content.push({ type: "tool_use", id: c.id.replace(/[^a-zA-Z0-9_-]/g, "_"), name: c.name, input: (c.input ?? {}) as Record<string, unknown> });
        if (content.length) out.push({ role: "assistant", content });
      }
    } else {
      out.push({
        role: "user",
        content: it.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id.replace(/[^a-zA-Z0-9_-]/g, "_"), content: r.content, is_error: r.isError || undefined })),
      });
    }
  }
  return out;
}

export async function callAnthropic({ items, tools }: ProviderInput): Promise<ProviderResult> {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  const model = anthropicModel();
  const useFallback = process.env.AI_FALLBACKS !== "off" && FALLBACK_MODELS.includes(model);
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 8000),
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: toAnthropicMessages(items),
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: strictSchema(jsonSchemaFor(t)) as Anthropic.Beta.BetaTool.InputSchema, strict: true })),
      thinking: { type: "adaptive" },
      output_config: { effort: (process.env.AI_EFFORT as "low" | "medium" | "high" | undefined) ?? "medium" },
      cache_control: { type: "ephemeral" },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    let text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const toolCalls = res.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    if (res.stop_reason === "refusal") text = "No puedo ayudar con esa petición. Si es algo clínico, consúltalo con tu equipo sanitario.";
    if (res.stop_reason === "max_tokens") text += "\n\n(Respuesta cortada por longitud.)";
    return {
      raw: res.content,
      text,
      toolCalls: res.stop_reason === "refusal" || res.stop_reason === "max_tokens" ? [] : toolCalls,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0 },
      stop: res.stop_reason ?? "unknown",
      model: res.model,
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.warn(JSON.stringify({ route: "ai/anthropic", status: e.status ?? null, type: (e.error as { error?: { type?: string } } | undefined)?.error?.type ?? null }));
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError(429, "Anthropic ha limitado las peticiones de tu cuenta. Espera un minuto y vuelve a intentarlo.");
    if (e instanceof Anthropic.AuthenticationError) throw new ProviderError(500, "Credenciales de IA no válidas en el servidor.");
    if (e instanceof Anthropic.BadRequestError) throw new ProviderError(400, "La petición a la IA no es válida (revisa la configuración del modelo).");
    if (e instanceof Anthropic.APIConnectionError) throw new ProviderError(504, "No se pudo contactar con el proveedor de IA.");
    if (e instanceof Anthropic.APIError) throw new ProviderError(502, `Error del proveedor de IA (${e.status ?? "?"}).`);
    throw e;
  }
}
