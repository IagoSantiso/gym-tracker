"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card, Empty, Icon, Notice, PageHead, useToast } from "@/components/ui";
import { ProposalCard } from "@/components/plan/ProposalCard";
import { useLive, useTable } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { all, put, remove } from "@/lib/db/repo";
import { CONSENT_KINDS } from "@/lib/db/defaults";
import { aiStatus, CONTEXT_RE, runConversation, userItem } from "@/lib/ai/client";
import type { ChatItem } from "@/lib/ai/tools";
import { asksForDosing } from "@/lib/domain/safety/guardrails";

const SUGGESTIONS = [
  "He desayunado dos tostadas con café con leche y una tortilla de dos huevos: regístralo.",
  "¿Cómo va mi día de comidas y qué ajusto en la cena?",
  "Me han ofrecido dos rosquillas: ¿cuánto suponen y cómo encajo el resto del día?",
  "¿Cómo ha ido mi semana de entrenamiento?",
  "Hoy tengo solo 30 minutos: ¿qué cambio propones en el plan?",
  "La prensa está ocupada: dame alternativas para hoy.",
  "Cámbiame la cena de mañana por algo más rápido.",
  "Resume mi semana y prepárame 3 preguntas para la consulta.",
  "¿Qué observas en mis datos de glucosa cuando corro?",
];

const TOOL_LABEL: Record<string, string> = {
  get_user_profile_summary: "perfil", get_training_history: "historial de entrenamiento", get_weekly_schedule: "plan semanal",
  get_activity_summary: "actividad", get_exercise_alternatives: "alternativas de ejercicios", get_food_inventory: "recetas y despensa",
  get_nutrition_summary: "nutrición", get_cgm_period_summary: "glucosa (agregada)", get_recovery_summary: "recuperación",
  propose_schedule_changes: "propuesta de plan", draft_training_plan: "borrador de rutina", draft_meal_plan: "propuesta de menú",
  draft_recipe: "receta propuesta", draft_weekly_summary: "resumen semanal", save_user_note: "nota",
};

export function AssistantPage() {
  const toast = useToast();
  const consents = useTable("consents") ?? [];
  const aiOn = consents.find((c) => c.kind === "ai_assistant")?.granted;
  const [status, setStatus] = useState<Awaited<ReturnType<typeof aiStatus>>>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const convs = useLive(async () => (await all("ai_conversations")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10), []) ?? [];
  const pending = useLive(async () => (await all("proposals")).filter((p) => p.status === "pending" && p.origin === "ai").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), []) ?? [];
  const usage = useLive(async () => (await all("ai_usage")).filter((u) => u.ts.slice(0, 7) === new Date().toISOString().slice(0, 7)), []) ?? [];
  useEffect(() => { void aiStatus().then(setStatus); }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("q");
    if (q) setText(q);
  }, []);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [items.length]);

  const send = async (msg: string) => {
    if (!msg.trim() || busy) return;
    setError(null);
    setBusy(true);
    const id = convId ?? crypto.randomUUID();
    if (!convId) setConvId(id);
    const base = [...items, await userItem(msg.trim(), items.length === 0)];
    setItems(base);
    setText("");
    try {
      const final = await runConversation(base, (u) => { setItems(u.items); if (u.error) setError(u.error); }, id);
      await put("ai_conversations", { id, title: msg.trim().slice(0, 60), provider: status?.provider ?? "?", model: status?.model ?? "?", items: final });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la respuesta. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const ready = aiOn && status?.configured;
  return (
    <>
      <PageHead eyebrow="Asistente" title="Pregunta sobre tus datos" actions={items.length ? <button className="btn ghost" onClick={() => { setItems([]); setConvId(null); setError(null); }}><Icon name="plus" />Nueva</button> : undefined}>
        Responde con tus datos reales mediante herramientas de solo lectura y crea propuestas que tú apruebas. Nunca da dosis de insulina ni indicaciones clínicas.
      </PageHead>
      {!aiOn && (
        <Card title="El asistente está desactivado" sub="Es opcional: todo lo demás funciona sin IA. Al activarlo eliges qué categorías de datos puede consultar.">
          <Link className="btn primary" href="/ajustes?tab=privacidad"><Icon name="chat" />Activar y elegir categorías</Link>
        </Card>
      )}
      {aiOn && status && !status.configured && <Notice kind="warn">El servidor no tiene configurada una clave de IA (<code>ANTHROPIC_API_KEY</code> u <code>OPENAI_API_KEY</code>). La app funciona igualmente sin asistente.</Notice>}
      {aiOn && status === null && <Notice kind="warn">Sin conexión con el servidor: el asistente necesita red.</Notice>}
      {aiOn && (
        <p className="xs dim">Proveedor: {status?.provider === "openai" ? "OpenAI" : "Claude (Anthropic)"}{status?.model ? ` · ${status.model}` : ""} · Categorías permitidas: {CONSENT_KINDS.filter((k) => k.kind.startsWith("ai_") && consents.find((c) => c.kind === k.kind)?.granted).map((k) => k.label.replace("IA: ", "")).join(", ") || "solo perfil"} · Este mes: {usage.reduce((a, u) => a + u.inputTokens + u.outputTokens, 0).toLocaleString("es-ES")} tokens{usage.some((u) => u.costUsd != null) ? ` (~${usage.reduce((a, u) => a + (u.costUsd ?? 0), 0).toFixed(2)} USD)` : ""}</p>
      )}
      <div className="stack" style={{ marginTop: 12 }}>
        {!items.length && ready && (
          <div className="pill-row">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => void send(s)}>{s}</button>)}</div>
        )}
        {items.map((it, i) => <Bubble key={i} it={it} />)}
        {busy && <div className="thinking" aria-live="polite"><span /><span /><span /> <span className="small muted">Pensando…</span></div>}
        {error && <Notice kind="warn">{error}</Notice>}
        <div ref={endRef} />
      </div>
      {pending.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <div className="sec-head" style={{ margin: "0 0 10px" }}><h2>Propuestas de la IA pendientes</h2></div>
          <div className="stack">{pending.slice(0, 5).map((p) => <ProposalCard key={p.id} p={p} />)}</div>
        </section>
      )}
      <form className="row" style={{ position: "sticky", bottom: "calc(var(--nav-h) + 12px)", marginTop: 16, background: "var(--bg)", padding: "8px 0", flexWrap: "nowrap" }}
        onSubmit={(e) => { e.preventDefault(); if (asksForDosing(text)) toast("Recuerda: el asistente no puede indicar dosis ni correcciones."); void send(text); }}>
        <textarea className="input" rows={2} value={text} disabled={!ready || busy} onChange={(e) => setText(e.target.value)} placeholder={ready ? "Escribe tu pregunta…" : "Asistente no disponible"} aria-label="Mensaje para el asistente"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} style={{ resize: "none" }} />
        <button className="btn primary" disabled={!ready || busy || !text.trim()} type="submit" aria-label="Enviar" aria-busy={busy}>{busy ? <span className="spinner" aria-hidden /> : <Icon name="right" />}</button>
      </form>
      {convs.length > 0 && (
        <Card title="Conversaciones guardadas en este dispositivo" className="no-print">
          <div className="list">
            {convs.map((c) => (
              <div className="li" key={c.id}>
                <button className="grow" style={{ textAlign: "left" }} onClick={() => { setItems(c.items as ChatItem[]); setConvId(c.id); }}>
                  <div className="t">{c.title}</div><div className="s">{c.updatedAt.slice(0, 16).replace("T", " ")}</div>
                </button>
                <button className="icon-btn" aria-label="Borrar conversación" onClick={() => void remove("ai_conversations", c.id)}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function Bubble({ it }: { it: ChatItem }) {
  if (it.role === "user") {
    return <div className="card tight" style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--lime-soft)", borderColor: "transparent" }}><div style={{ whiteSpace: "pre-wrap" }}>{it.text.replace(CONTEXT_RE, "")}</div></div>;
  }
  if (it.role === "tool") {
    return (
      <div className="stack">
        {it.results.map((r) => r.display ? <SummaryCard key={r.id} d={r.display as never} /> : (
          <div key={r.id} className="xs dim">{r.isError ? "⚠ " : "✓ "}Consulta: {TOOL_LABEL[r.name] ?? r.name}{r.isError ? ` — ${r.content.slice(0, 160)}` : ""}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="card tight" style={{ maxWidth: "92%" }}>
      {it.guardrail && <div className="badge warn" style={{ marginBottom: 6 }}>Guardarraíl clínico aplicado</div>}
      {it.text ? <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{it.text}</div> : it.toolCalls.length ? <div className="xs dim">Consultando tus datos…</div> : null}
      {it.text && <div className="xs dim" style={{ marginTop: 6 }}>Respuesta generada por IA a partir de tus datos; puede contener errores. No es consejo médico.</div>}
    </div>
  );
}

function SummaryCard({ d }: { d: { achievements: string[]; opportunities: string[]; experiment: { title: string; description: string }; observations: string[]; questions_for_care_team: string[]; meta: { confidence: string; data_used: string[]; warnings: string[] } } }) {
  return (
    <Card title="Resumen semanal (borrador IA)" right={<span className="badge src-ai_draft">Borrador IA</span>}>
      <div className="small">
        <b>Logros</b><ol>{d.achievements.map((x) => <li key={x}>{x}</li>)}</ol>
        <b>Oportunidades</b><ol>{d.opportunities.map((x) => <li key={x}>{x}</li>)}</ol>
        <b>Experimento</b><p style={{ margin: "2px 0 8px" }}>{d.experiment.title}: {d.experiment.description}</p>
        {d.observations.length > 0 && <><b>Observaciones</b><ul>{d.observations.map((x) => <li key={x}>{x}</li>)}</ul></>}
        {d.questions_for_care_team.length > 0 && <><b>Preguntas para tu equipo</b><ul>{d.questions_for_care_team.map((x) => <li key={x}>{x}</li>)}</ul></>}
        <div className="xs dim">Confianza {d.meta.confidence} · datos: {d.meta.data_used.join(", ")}{d.meta.warnings.length ? ` · avisos: ${d.meta.warnings.join("; ")}` : ""}</div>
      </div>
    </Card>
  );
}
