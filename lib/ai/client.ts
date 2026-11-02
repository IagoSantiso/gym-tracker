"use client";
/** Bucle de conversación: servidor (modelo + guardarraíles) ↔ cliente (herramientas sobre IndexedDB). */
import { getMeta, setMeta, tbl } from "@/lib/db/db";
import { all, nowIso, put } from "@/lib/db/repo";
import { localDate, WEEKDAYS_ES, weekdayOf } from "@/lib/domain/time";
import { accessToken } from "@/lib/sync/supabase";
import type { ChatItem, ChatRequest, ChatResponse } from "./tools";
import { executeTool } from "./client-tools";
import type { ConsentKind } from "@/lib/db/types";

export const CONTEXT_RE = /^\[Contexto de la app[^\]]*\]\n\n/;

/** Código de acceso personal al asistente (solo en este dispositivo; no se sincroniza). */
export const getAccessCode = () => getMeta<string | null>("aiAccessCode", null);
export const setAccessCode = (code: string | null) => setMeta("aiAccessCode", code);

export async function aiStatus(): Promise<{ configured: boolean; provider: string; model: string | null; needsLogin: boolean; accessCode?: boolean } | null> {
  try {
    const r = await fetch("/api/ai/status", { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

async function context(): Promise<ChatRequest["context"]> {
  const p = await tbl("profiles").get("me");
  const d = await tbl("diabetes_settings").get("me");
  const consents = Object.fromEntries((await all("consents")).map((c) => [c.kind, c.granted])) as Partial<Record<ConsentKind, boolean>>;
  return { today: localDate(), timezone: p?.timezone ?? "Europe/Madrid", consents, unit: d?.unit ?? "mg/dL" };
}

export async function userItem(text: string, first: boolean): Promise<ChatItem> {
  if (!first) return { role: "user", text };
  const c = await context();
  return { role: "user", text: `[Contexto de la app — hoy ${WEEKDAYS_ES[weekdayOf(c.today)]} ${c.today}; zona ${c.timezone}; unidad de glucosa del usuario ${c.unit}]\n\n${text}` };
}

export interface TurnUpdate {
  items: ChatItem[];
  error?: string;
}

/** Ejecuta una vuelta completa (con herramientas) y va notificando el estado. */
export async function runConversation(items: ChatItem[], onUpdate: (u: TurnUpdate) => void, conversationId: string): Promise<ChatItem[]> {
  let cur = [...items];
  for (let step = 0; step < 8; step++) {
    const token = await accessToken();
    const code = token ? null : await getAccessCode();
    let res: Response;
    try {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : code ? { "X-Nexo-Access": code } : {}) },
        body: JSON.stringify({ items: cur, context: await context() } satisfies ChatRequest),
      });
    } catch {
      onUpdate({ items: cur, error: "Sin conexión: el asistente necesita red. El resto de la app funciona sin ella." });
      return cur;
    }
    const j = (await res.json().catch(() => ({ error: "Respuesta no válida" }))) as ChatResponse;
    if (!res.ok || j.error) {
      onUpdate({ items: cur, error: j.error ?? `Error ${res.status}` });
      return cur;
    }
    if (j.emergency) {
      cur = [...cur, { role: "assistant", text: j.emergency, toolCalls: [], provider: "local", raw: null, guardrail: true }];
      onUpdate({ items: cur });
      return cur;
    }
    if (!j.item) return cur;
    cur = [...cur, j.item];
    onUpdate({ items: cur });
    if (j.usage) {
      await put("ai_usage", { ts: nowIso(), provider: j.provider ?? "?", model: j.model ?? "?", inputTokens: j.usage.inputTokens, outputTokens: j.usage.outputTokens, cacheReadTokens: j.usage.cacheReadTokens, conversationId, costUsd: j.usage.costUsd });
    }
    if (!j.item.toolCalls.length) break;
    const results = [];
    for (const call of j.item.toolCalls) {
      const r = await executeTool(call);
      results.push({ id: call.id, name: call.name, content: r.content, isError: r.isError, display: r.display });
    }
    cur = [...cur, { role: "tool", results }];
    onUpdate({ items: cur });
  }
  return cur;
}
