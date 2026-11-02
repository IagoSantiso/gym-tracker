import { NextResponse } from "next/server";
import { authorize } from "@/lib/server/auth";
import { checkLimits, recordTokens } from "@/lib/server/ai/limits";
import { aiConfigured, runChatTurn, validateRequest } from "@/lib/server/ai/chat";
import { ProviderError } from "@/lib/server/ai/types";
import { MAX_CHAT_BODY_BYTES } from "@/lib/ai/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: "El asistente no está configurado en este servidor. La app funciona igual sin él." }, { status: 503 });
  const who = await authorize(req);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const limited = checkLimits(who.key);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  if (Number(req.headers.get("content-length")) > MAX_CHAT_BODY_BYTES) return NextResponse.json({ error: "Reduce los adjuntos o empieza una conversación nueva." }, { status: 413 });
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CHAT_BODY_BYTES) { await reader.cancel(); return NextResponse.json({ error: "Reduce los adjuntos o empieza una conversación nueva." }, { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }
  const parsed = validateRequest(body);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
  const t0 = Date.now();
  try {
    const res = await runChatTurn(parsed);
    if (res.usage) recordTokens(who.key, res.usage.inputTokens + res.usage.outputTokens);
    // Registro técnico SIN contenido (ni prompts, ni respuestas, ni datos de salud)
    console.info(JSON.stringify({ route: "ai/chat", ms: Date.now() - t0, model: res.model ?? null, in: res.usage?.inputTokens ?? 0, out: res.usage?.outputTokens ?? 0, cache: res.usage?.cacheReadTokens ?? 0, tools: res.item?.toolCalls.length ?? 0, guardrail: !!res.item?.guardrail, emergency: !!res.emergency }));
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 500;
    console.warn(JSON.stringify({ route: "ai/chat", ms: Date.now() - t0, status }));
    return NextResponse.json({ error: e instanceof ProviderError ? e.message : "Error interno del asistente." }, { status });
  }
}
