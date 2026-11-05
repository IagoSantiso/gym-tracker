"use client";
import Link from "next/link";
import { useLive, useProfile } from "@/lib/db/hooks";
import { all } from "@/lib/db/repo";
import { addDays, localDate, formatDateEs } from "@/lib/domain/time";
import { diarySignature, hasUnknownEnergy } from "@/lib/domain/nutrition/diary";
import { currentTargets } from "@/lib/services/targets";

export function WeeklyEnergy() {
  const p = useProfile();
  const today = localDate(Date.now(), p.timezone);
  const data = useLive(async () => {
    const [logs, activity, workouts, endurance, target] = await Promise.all([
      all("food_logs"),
      all("daily_activity"),
      all("workout_sessions"),
      all("endurance_sessions"),
      currentTargets(),
    ]);
    return {
      days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i - 6),
          food = logs.filter((l) => l.date === date);
        return {
          date,
          count: food.length,
          kcal: Math.round(food.reduce((a, l) => a + l.totals.kcal, 0)),
          complete:
            food.length > 0 &&
            !food.some(hasUnknownEnergy) &&
            activity.some(
              (a) =>
                a.date === date &&
                a.nutritionSignature === diarySignature(food),
            ),
          sessions:
            workouts.filter((w) => w.date === date && w.status === "completed")
              .length + endurance.filter((e) => e.date === date).length,
        };
      }),
      target,
    };
  }, [today]);
  if (!data) return null;
  const complete = data.days.filter((d) => d.complete);
  return (
    <section className="card">
      <div className="today-section-head">
        <h2>Tu semana, en contexto</h2>
        <Link className="text-action" href="/nutricion">
          Abrir diario
        </Link>
      </div>
      <p className="small">
        <b>{complete.length}/7 días</b> con alimentación confirmada ·{" "}
        <b>{data.days.reduce((a, d) => a + d.sessions, 0)}</b> actividades
        realizadas.
      </p>
      <div className="week-energy">
        {data.days.map((d) => (
          <div key={d.date}>
            <span>{formatDateEs(d.date, { weekday: "short" })}</span>
            <strong>{d.count ? d.kcal.toLocaleString("es-ES") : "—"}</strong>
            <small>
              {d.complete ? "Confirmado" : d.count ? "Parcial" : "Sin registro"}
            </small>
            <span className={`week-dot ${d.complete ? "complete" : ""}`} />
          </div>
        ))}
      </div>
      <p className="xs dim">
        kcal registradas. Los días parciales o vacíos no se interpretan como
        déficit. Compara esta regularidad con tu tendencia de peso durante
        varias semanas.
      </p>
      {complete.length > 0 && (
        <p className="small">
          Media de ingesta en los {complete.length} días confirmados:{" "}
          <b>
            {Math.round(
              complete.reduce((a, d) => a + d.kcal, 0) / complete.length,
            ).toLocaleString("es-ES")}{" "}
            kcal
          </b>
          .
        </p>
      )}
    </section>
  );
}
