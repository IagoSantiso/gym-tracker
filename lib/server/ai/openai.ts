import "server-only";
/** Adaptador alternativo OpenAI (Responses API, store: false). */
import OpenAI from "openai";
import { jsonSchemaFor, strictSchema, type ChatItem } from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "./prompt";
import { ProviderError, type ProviderInput, type ProviderResult } from "./types";

export const openaiModel = () => process.env.OPENAI_MODEL || "gpt-5.5";

type InputItem = OpenAI.Responses.ResponseInputItem;

export function toOpenAIInput(items: ChatItem[]): InputItem[] {
  const out: InputItem[] = [];
  for (const it of items) {
    if (it.role === "user") out.push({ role: "user", content: it.text });
    else if (it.role === "assistant") {
      if (it.provider === "openai" && Array.isArray(it.raw)) out.push(...(it.raw as InputItem[]));
      else {
        if (it.text) out.push({ role: "assistant", content: it.text });
        for (const c of it.toolCalls) out.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.input ?? {}) });
      }
    } else for (const r of it.results) out.push({ type: "function_call_output", call_id: r.id, output: r.content });
  }
  return out;
}

export async function callOpenAI({ items, tools }: ProviderInput): Promise<ProviderResult> {
  const client = new OpenAI({ timeout: 60_000, maxRetries: 2 });
  const model = openaiModel();
  try {
    const res = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input: toOpenAIInput(items),
      tools: tools.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: strictSchema(jsonSchemaFor(t)), strict: true })),
      store: false,
      include: ["reasoning.encrypted_content"],
      max_output_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 8000),
    });
    const toolCalls = res.output
      .filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call")
      .map((o) => {
        let input: unknown = null;
        try { input = JSON.parse(o.arguments); } catch { input = null; }
        return { id: o.call_id, name: o.name, input };
      });
    return {
      raw: res.output,
      text: (res.output_text ?? "").trim(),
      toolCalls,
      usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, cacheReadTokens: res.usage?.input_tokens_details?.cached_tokens ?? 0 },
      stop: res.status ?? "unknown",
      model: res.model,
    };
  } catch (e) {
    if (e instanceof OpenAI.APIError) {
      // Diagnóstico técnico sin contenido del usuario
      console.warn(JSON.stringify({ route: "ai/openai", status: e.status ?? null, code: e.code ?? null, type: e.type ?? null }));
    }
    if (e instanceof OpenAI.RateLimitError) {
      if (e.code === "insufficient_quota") throw new ProviderError(402, "Tu cuenta de OpenAI no tiene saldo para la API (la suscripción de ChatGPT no la incluye). Añade crédito en platform.openai.com → Settings → Billing y vuelve a intentarlo.");
      throw new ProviderError(429, "OpenAI ha limitado las peticiones de tu cuenta (límite de uso del modelo). Espera un minuto o usa un modelo con más margen en OPENAI_MODEL.");
    }
    if (e instanceof OpenAI.NotFoundError || (e instanceof OpenAI.BadRequestError && /model/i.test(e.message))) {
      throw new ProviderError(502, `El modelo configurado (${process.env.OPENAI_MODEL ?? "por defecto"}) no está disponible para tu cuenta de OpenAI. Revisa OPENAI_MODEL en Vercel.`);
    }
    if (e instanceof OpenAI.AuthenticationError) throw new ProviderError(500, "Credenciales de IA no válidas en el servidor.");
    if (e instanceof OpenAI.APIConnectionError) throw new ProviderError(504, "No se pudo contactar con el proveedor de IA.");
    if (e instanceof OpenAI.APIError) throw new ProviderError(502, `Error del proveedor de IA (${e.status ?? "?"}).`);
    throw e;
  }
}
