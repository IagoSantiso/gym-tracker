"use client";
import Link from "next/link";
import { ActionButton } from "@/components/ui";
import { useLive } from "@/lib/db/hooks";
import { loadDayBalance } from "@/lib/services/balance";
import { confirmDiary } from "@/lib/services/diary";

export function TodayEnergy({ date }: { date: string }) {
  const b = useLive(() => loadDayBalance(date), [date]);
  const fmt = (n: number) => Math.round(n).toLocaleString("es-ES");
  if (!b)
    return (
      <section className="today-energy card" aria-busy="true">
        Cargando tu día…
      </section>
    );
  const { budget, energy: e } = b;
  const range = (v: [number, number]) =>
    v[0] === v[1] ? fmt(v[0]) : `${fmt(v[0])}–${fmt(v[1])}`;
  const remaining = budget.remaining;
  return (
    <section className="today-energy card" aria-labelledby="today-energy-title">
      <div className="today-section-head">
        <h2 id="today-energy-title">Tu balance de hoy</h2>
        <span className="badge">
          {b.confirmed ? "Registro confirmado" : "Día en curso"}
        </span>
      </div>
      <div className="energy-focus">
        <div>
          <span className="eyebrow">Energía registrada</span>
          <strong>
            {b.logs.length
              ? `${budget.unknown ? "≥ " : ""}${fmt(budget.intake)}`
              : "—"}
            <small> kcal</small>
          </strong>
        </div>
        <div className="energy-target">
          <span>Objetivo de ingesta</span>
          <b>
            {budget.target ? `${range(budget.target)} kcal` : "Por configurar"}
          </b>
          <Link href="/ajustes?tab=objetivos">Revisar objetivo</Link>
        </div>
      </div>
      {budget.target && (
        <div
          className="energy-meter"
          role="progressbar"
          aria-label="Calorías registradas respecto al objetivo"
          aria-valuemin={0}
          aria-valuemax={budget.target[1]}
          aria-valuenow={Math.min(budget.intake, budget.target[1])}
        >
          <i
            style={{
              width: `${Math.min(100, (100 * budget.intake) / budget.target[1])}%`,
            }}
          />
        </div>
      )}
      <p className="energy-answer" aria-live="polite">
        {budget.status === "empty"
          ? "Añade tu primera comida para empezar."
          : budget.unknown
            ? "Hay comidas con energía sin completar."
            : !remaining
              ? "Configura tu objetivo para ver cómo vas."
              : budget.status === "above"
                ? `${fmt(-remaining[1])} kcal por encima de tu rango.`
                : budget.status === "in_range"
                  ? "Tu ingesta registrada está en el rango objetivo."
                  : `${range([Math.max(0, remaining[0]), Math.max(0, remaining[1])])} kcal hasta tu rango objetivo.`}
      </p>
      <div className="energy-context">
        <span>
          Gasto estimado del día{" "}
          <b>{e.ok ? `~${fmt(e.spent)} kcal` : "Sin datos"}</b>
        </span>
        <span>
          {budget.balance == null
            ? "Balance final pendiente"
            : `${budget.balance <= 0 ? "Déficit" : "Superávit"} estimado: ~${fmt(Math.abs(budget.balance))} kcal`}
        </span>
      </div>
      <details className="energy-explanation">
        <summary>Previsión y detalle del cálculo</summary>
        <p className="small">
          El gasto corresponde al día completo. Base y pasos: ~
          {fmt(e.base + e.steps)} kcal · ejercicio registrado: ~
          {fmt(e.exercise)} kcal. Las actividades sin duración quedan fuera del
          cálculo.
        </p>
        {b.remaining.length > 0 && (
          <p className="small">
            Menú pendiente: {fmt(b.plannedRest.kcal)} kcal. Si lo consumes, la
            ingesta prevista sería {fmt(e.projectedIntake)} kcal. No se suma a
            lo que has comido.
          </p>
        )}
        <p className="xs dim">
          El objetivo es el mismo en toda la app. El ejercicio no modifica
          automáticamente una pauta de ingesta. El balance es orientativo;
          interpreta la tendencia de varias semanas.
        </p>
        {!e.ok && <p className="small">{e.message}</p>}
      </details>
      {b.logs.length > 0 && (
        <div className="diary-confirm">
          <span className="xs dim">
            {b.confirmed
              ? "Si editas o añades comida, el día vuelve a quedar pendiente."
              : "¿Has registrado todo lo que has comido hoy?"}
          </span>
          <ActionButton
            className="text-action"
            onRun={() => confirmDiary(date, !b.confirmed)}
          >
            {b.confirmed ? "Reabrir diario" : "Confirmar día completo"}
          </ActionButton>
        </div>
      )}
    </section>
  );
}
