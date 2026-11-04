"use client";
import { useState } from "react";
import { ActionButton, Field } from "@/components/ui";
import { patch } from "@/lib/db/repo";
import type { Proposal } from "@/lib/db/types";

/** Edit the pending proposal, never live inventory, before accepting photo detections. */
export function PantryReview({proposal, onDirty}: {proposal: Proposal; onDirty: (dirty: boolean) => void}) {
  const [ops,setOps] = useState(proposal.ops);
  const [dirty,setDirty] = useState(false);
  const change = (index: number, changes: Record<string,unknown>) => { setDirty(true);onDirty(true);setOps(ops.map((op,i) => i === index && op.op === "create" ? {...op,record:{...op.record,...changes}} : op)); };
  return <details><summary>Revisar y corregir alimentos antes de aceptar</summary><div className="stack">{ops.map((op,index) => op.op === "create" && op.table === "pantry_items" ? <div className="card" key={index}>
    <Field label="Alimento detectado"><input value={String(op.record.name)} onChange={e => change(index,{name:e.target.value,foodId:"unlisted:"+e.target.value.toLocaleLowerCase("es")})} /></Field>
    <Field label="Gramos (vacío si no se sabe)"><input type="number" min="0" max="100000" value={op.record.quantityKnown === false ? "" : Number(op.record.grams)} onChange={e => change(index,{quantityKnown:e.target.value !== "",grams:e.target.value === "" ? 0 : Number(e.target.value)})} /></Field>
    <Field label="Lugar"><select value={String(op.record.location)} onChange={e => change(index,{location:e.target.value})}><option value="fridge">Nevera</option><option value="freezer">Congelador</option><option value="pantry">Despensa</option></select></Field>
    <button className="btn sm ghost" onClick={() => { setOps(ops.filter((_,i)=>i!==index));setDirty(true);onDirty(true); }}>Descartar esta identificación</button>
  </div> : null)}<ActionButton className="btn" disabled={!dirty || !ops.length || ops.some(o => o.op === "create" && (!String(o.record.name ?? "").trim() || !Number.isFinite(Number(o.record.grams)) || Number(o.record.grams)<0))} onRun={async () => { await patch("proposals",proposal.id,{ops,summary:ops.filter(o=>o.op === "create").map(o=>o.op === "create" ? `${o.record.name}: ${o.record.quantityKnown === false ? "cantidad desconocida" : o.record.grams + " g"}` : "").join(" · ")});setDirty(false);onDirty(false); }} success="Correcciones guardadas en el borrador">Guardar correcciones antes de aceptar</ActionButton></div></details>;
}
