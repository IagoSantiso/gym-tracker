"use client";
import Link from "next/link";
import { useLive } from "@/lib/db/hooks";
import { loadDayBalance } from "@/lib/services/balance";

export function TodayEnergy({ date }: { date: string }) {
  const b = useLive(()=>loadDayBalance(date),[date]);
  const e = b?.energy;
  const fmt = (n?: number)=>n==null ? "—" : Math.round(n).toLocaleString("es-ES");
  return <section className="today-energy card" aria-labelledby="today-energy-title">
    <div className="today-section-head"><h2 id="today-energy-title">Tu energía de hoy</h2><Link className="text-action" href="/nutricion?tab=hoy">Ver balance</Link></div>
    <div className="today-energy-values">
      <div><span>Consumido</span><strong>{fmt(e?.intake)} <small>kcal</small></strong><span className="xs dim">Comidas registradas</span></div>
      <div><span>Gasto estimado del día</span><strong>{fmt(e?.ok ? e.spent : undefined)} <small>kcal</small></strong><span className="xs dim">Día completo · base + actividad</span></div>
    </div>
    {e?.ok ? <><p className="small">Ejercicio registrado: <b>~{fmt(e.exercise)} kcal</b> · Base y pasos: ~{fmt(e.base+e.steps)} kcal.</p><p className="small">Con las comidas pendientes: <b>{fmt(e.projectedIntake)} kcal</b> previstas · diferencia frente al gasto diario: {e.projectedBalance>0 ? "+" : ""}{fmt(e.projectedBalance)} kcal.</p></> : <p className="small muted">{e?.message ?? "Calculando tu balance…"}{e && <> <Link href="/ajustes">Completar datos</Link></>}</p>}
    <p className="xs dim">El gasto es una estimación para el día completo, no calorías quemadas hasta esta hora. Las actividades sin duración quedan fuera de la estimación.</p>
  </section>;
}
