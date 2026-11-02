import "server-only";
/** Orquestación de una vuelta del chat: guardarraíles de entrada, proveedor, validación y guardarraíles de salida. */
import { AttachmentSchema, MAX_ATTACHMENT_CHARS, attachmentSize } from "@/lib/ai/attachments";
import { TOOLS, validateToolInput, type ChatRequest, type ChatResponse } from "@/lib/ai/tools";
import { EMERGENCY_RESPONSE, blockedMessage, detectEmergency, scanDeep, scanOutput } from "@/lib/domain/safety/guardrails";
import { callAnthropic, anthropicModel } from "./anthropic";
import { callOpenAI, openaiModel } from "./openai";
import type { ProviderInput, ProviderResult } from "./types";

export type Provider = "anthropic" | "openai";
export const providerName = (): Provider => (process.env.AI_PROVIDER === "openai" ? "openai" : "anthropic");
export const aiConfigured = () => (providerName() === "openai" ? !!process.env.OPENAI_API_KEY : !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN));
export const currentModel = () => (providerName() === "openai" ? openaiModel() : anthropicModel());

/** Precios orientativos USD por millón de tokens (entrada, salida, lectura de caché). */
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2], "claude-sonnet-5-5": [2, 10, 0.2], "claude-haiku-5-5": [0.1, 0.5, 0.01], "claude-fable-5-1": [10, 50, 0.25],
};

export function validateRequest(body: unknown): ChatRequest | string {
  const b = body as ChatRequest;
  if (!b || !Array.isArray(b.items) || !b.context) return "Petición mal formada.";
  if (b.items.length === 0 || b.items.length > 80) return "Conversación vacía o demasiado larga: empieza una nueva.";
  let attachmentChars = 0;
  for (const it of b.items) {
    if (!it || !["user", "assistant", "tool"].includes(it.role)) return "Elemento de conversación no válido.";
    if (it.role === "user" && (typeof it.text !== "string" || it.text.length > 8000)) return "Mensaje demasiado largo.";
    if (it.role === "user" && it.attachments !== undefined) {
      if (!Array.isArray(it.attachments) || it.attachments.length > 4) return "Adjuntos no válidos: máximo 4 por mensaje.";
      for (const input of it.attachments) {
        const parsed = AttachmentSchema.safeParse(input);
        if (!parsed.success) return "Adjunto no válido o demasiado grande.";
        const a = parsed.data;
        attachmentChars += attachmentSize(a);
        if (a.kind !== "text") {
          const bytes = Buffer.from(a.data, "base64");
          if (bytes.toString("base64") !== a.data) return "Codificación de adjunto no válida.";
          const valid = a.kind === "pdf" ? bytes.subarray(0, 5).toString() === "%PDF-"
            : a.mediaType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : a.mediaType === "image/png" ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
            : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
          if (!valid) return "El contenido del archivo no corresponde a su formato.";
        }
      }
    }
    if (it.role === "tool" && (!Array.isArray(it.results) || it.results.some((r) => typeof r.content !== "string" || r.content.length > 60_000))) return "Resultado de herramienta no válido.";
  }
  if (attachmentChars > MAX_ATTACHMENT_CHARS) return "Los adjuntos de esta conversación ocupan demasiado. Empieza una nueva con menos archivos.";
  return b;
}

export async function runChatTurn(req: ChatRequest, call?: (i: ProviderInput) => Promise<ProviderResult>): Promise<ChatResponse> {
  const lastUser = [...req.items].reverse().find((i) => i.role === "user");
  const lastItem = req.items.at(-1);
  if (lastItem?.role === "user" && lastUser && lastUser.role === "user" && detectEmergency(lastUser.text)) {
    return { emergency: EMERGENCY_RESPONSE };
  }
  const allowed = TOOLS.filter((t) => t.consent === "ai_assistant" || req.context.consents[t.consent]);
  const provider = providerName();
  const fn = call ?? (provider === "openai" ? callOpenAI : callAnthropic);
  const r = await fn({ items: req.items, tools: allowed });
  const out = scanOutput(r.text);
  const toolCalls = r.toolCalls.map((c) => {
    const allowedTool = allowed.some((t) => t.name === c.name);
    const v = validateToolInput(c.name, c.input);
    const scan = scanDeep(c.input);
    return { ...c, invalid: !allowedTool ? "Herramienta no autorizada por tus consentimientos." : v.ok ? null : v.error, blocked: !scan.ok };
  });
  const price = PRICES[r.model] ?? PRICES[currentModel()];
  return {
    item: { role: "assistant", text: out.ok ? r.text : blockedMessage(out.violations), toolCalls, provider, raw: r.raw, guardrail: !out.ok },
    usage: {
      ...r.usage,
      costUsd: price ? Math.round((((r.usage.inputTokens - r.usage.cacheReadTokens) * price[0] + r.usage.outputTokens * price[1] + r.usage.cacheReadTokens * price[2]) / 1e6) * 10000) / 10000 : null,
    },
    provider,
    model: r.model,
  };
}
