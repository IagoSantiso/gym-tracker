"use client";
import { PantryReview } from "@/components/nutrition/PantryReview";
import { useState } from "react";
import { ActionButton, Card, Icon, useToast } from "@/components/ui";
import type { Proposal } from "@/lib/db/types";
import { acceptProposal, rejectProposal, revertProposal } from "@/lib/services/plan";

const CONF = { low: "Confianza baja", medium: "Confianza media", high: "Confianza alta" };

export function ProposalCard({ p }: { p: Proposal }) {
  const toast = useToast();
  const [pantryDirty, setPantryDirty] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Card title={p.title} sub={`${p.origin === "ai" ? "Propuesta de la IA" : "Propuesta por reglas"} · ${CONF[p.confidence]} · ${p.createdAt.slice(0, 10)}`}
      right={<span className={`badge ${p.status === "pending" ? "warn" : p.status === "accepted" ? "ok" : ""}`}>{{ pending: "Pendiente", accepted: "Aceptada", rejected: "Rechazada", reverted: "Deshecha", expired: "Caducada" }[p.status]}</span>}>
      <p className="small" style={{ margin: "0 0 6px" }}>{p.summary}</p>
      <details className="small">
        <summary className="muted">Por qué, con qué datos y supuestos</summary>
        <div style={{ paddingTop: 6 }}>
          {p.reasons.length > 0 && <><b>Motivos</b><ul>{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul></>}
          {p.dataUsed.length > 0 && <><b>Datos usados</b><ul>{p.dataUsed.map((r) => <li key={r}>{r}</li>)}</ul></>}
          {p.assumptions.length > 0 && <><b>Supuestos</b><ul>{p.assumptions.map((r) => <li key={r}>{r}</li>)}</ul></>}
          {p.warnings.length > 0 && <><b>Avisos</b><ul>{p.warnings.map((r) => <li key={r}>{r}</li>)}</ul></>}
          <div className="xs dim">{p.ops.length} cambio(s) · reversible</div>
        </div>
      </details>
      {p.kind === "ai_pantry" && p.status === "pending" && <PantryReview key={p.updatedAt} proposal={p} onDirty={setPantryDirty} />}
      {p.decisionReason && <p className="xs muted">Motivo del rechazo: {p.decisionReason}</p>}
      {p.status === "pending" && !rejecting && (
        <div className="row" style={{ marginTop: 8 }}>
          <ActionButton className="btn sm primary" icon="check" disabled={pantryDirty} onRun={async () => { const r = await acceptProposal(p.id); if (!r.ok) throw new Error(r.error ?? "No se pudo aplicar"); }} success="Cambio aplicado">Aceptar</ActionButton>
          <button className="btn sm ghost" onClick={() => setRejecting(true)}>Rechazar</button>
        </div>
      )}
      {rejecting && (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" style={{ maxWidth: 300 }} placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo del rechazo" />
          <ActionButton className="btn sm" onRun={async () => { await rejectProposal(p.id, reason.trim() || null); setRejecting(false); }} success="Propuesta rechazada">Confirmar rechazo</ActionButton>
        </div>
      )}
      {p.status === "accepted" && p.inverse && (
        <div style={{ marginTop: 8 }}><ActionButton className="btn sm ghost" onRun={() => revertProposal(p.id)} success="Cambio deshecho">Deshacer</ActionButton></div>
      )}
    </Card>
  );
}
