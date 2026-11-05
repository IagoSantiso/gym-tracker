"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, Field, Notice, NumInput, PageHead, Toggle, useToast } from "@/components/ui";
import { ChipsF, NumF, SelectF, TextF } from "@/components/settings/fields";
import { useDiabetes, useGoals, usePreferences, useProfile, useTable } from "@/lib/db/hooks";
import { nowIso, patch, put } from "@/lib/db/repo";
import { EQUIPMENT_LABEL } from "@/lib/domain/training/library";
import { ALLERGENS } from "@/lib/domain/nutrition/foods";
import { WEEKDAYS_ES, localDate, weekStartOf } from "@/lib/domain/time";
import type { EquipmentId, Weekday } from "@/lib/db/types";
import { generatePlan } from "@/lib/services/plan";
import { generateWeekMenu } from "@/lib/services/nutrition";

const STEPS = ["Bienvenida", "Cuerpo", "Objetivos", "Entrenamiento", "Comida", "Diabetes", "Listo"];

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const p = useProfile();
  const g = useGoals();
  const pr = usePreferences();
  const d = useDiabetes();
  const consents = useTable("consents") ?? [];
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const withTimeout = <T,>(p: Promise<T>, label: string) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`"${label}" tarda demasiado. Cierra las otras pestañas de la app y reintenta.`)), 20000))]);
  const finish = async () => {
    setFail(null);
    try {
      const ws = weekStartOf(localDate());
      setBusy("Guardando tu perfil…");
      await withTimeout(patch("profiles", "me", { onboardingCompletedAt: nowIso(), draft: false }), "Guardar perfil");
      if(step>=6) {
      setBusy("Creando el plan de la semana…");
      await withTimeout(generatePlan(ws), "Crear plan");
      setBusy("Creando el menú y la lista de la compra…");
      await withTimeout(generateWeekMenu(ws, { kcalTarget: null, keepLocked: true }), "Crear menú");
      }
      toast(step>=6?"¡Listo! Plan y menú de la semana creados":"Perfil guardado. Ya puedes registrar tu día.");
      location.assign("/");
    } catch (e) {
      setBusy(null);
      setFail(e instanceof Error ? e.message : String(e));
    }
  };
  const nav = (
    <div className="row between" style={{ marginTop: 16 }}>
      <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Atrás</button>
      {step===2&&<button className="btn" disabled={!!busy} onClick={()=>void finish()}>Guardar y empezar</button>}
      <span className="small dim">{step + 1} / {STEPS.length}</span>
      {step < STEPS.length - 1 ? <button className="btn primary" onClick={() => setStep((s) => s + 1)}>{step === 0 ? "Empezar" : "Siguiente"}</button>
        : <button className="btn primary" disabled={!!busy} onClick={() => void finish()}>{busy ? "Creando…" : "Crear mi semana"}</button>}
    </div>
  );
  return (
    <>
      <PageHead eyebrow={`Configuración · ${STEPS[step]}`} title="Vamos a conocerte">
        Todo es opcional y editable más tarde en Ajustes. Lo que ya nos contaste aparece precargado como borrador.
      </PageHead>
      <div className="bar-track" style={{ margin: "10px 0 16px" }}><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      {step === 0 && (
        <Card title="Cómo funciona NEXO">
          <ul className="small" style={{ lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
            <li>Tus datos se guardan en <b>este dispositivo</b> y funcionan sin conexión. La nube y la IA son opcionales.</li>
            <li>La app <b>no es un dispositivo médico</b>: no calcula dosis de insulina, ratios ni correcciones, ni sustituye a tu lector o app oficial.</li>
            <li>Distingue siempre lo <b>medido</b>, <b>importado</b>, <b>introducido</b>, <b>calculado</b> y <b>estimado</b>.</li>
            <li>Los cambios que proponga (reglas o IA) necesitan tu aprobación y se pueden deshacer.</li>
          </ul>
          <div className="stack" style={{ marginTop: 14 }}>
            <b className="small">Permisos (puedes cambiarlos cuando quieras)</b>
            {(["ai_assistant", "cloud_sync"] as const).map((k) => {
              const c = consents.find((x) => x.kind === k);
              return <Toggle key={k} checked={!!c?.granted} label={k === "ai_assistant" ? "Usar el asistente IA" : "Sincronizar en la nube (si está configurada)"}
                hint={k === "ai_assistant" ? "Envía tus preguntas y resúmenes mínimos al proveedor de IA." : "Copia en tu proyecto Supabase."}
                onChange={(v) => void put("consents", { id: k, kind: k, granted: v, grantedAt: v ? nowIso() : null, revokedAt: v ? null : nowIso(), version: 1 })} />;
            })}
          </div>
          {nav}
        </Card>
      )}
      {step === 1 && (
        <Card title="Tu cuerpo" sub="Se usa para estimar rangos de energía y proteína. Sin estos datos, la app no calcula objetivos.">
          <div className="grid g2">
            <TextF table="profiles" field="displayName" value={p.displayName} label="Nombre" />
            <TextF table="profiles" field="birthDate" value={p.birthDate} label="Fecha de nacimiento (opcional)" type="date" />
            <SelectF table="profiles" field="sex" value={p.sex} label="Sexo biológico (opcional)" hint="Solo para la ecuación de gasto energético; sin él se usa un rango más amplio."
              options={[{ v: "", l: "Prefiero no indicarlo" }, { v: "female", l: "Mujer" }, { v: "male", l: "Hombre" }]} />
            <NumF table="profiles" field="heightCm" value={p.heightCm} label="Altura (cm)" />
            <WeightQuick />
          </div>
          {nav}
        </Card>
      )}
      {step === 2 && (
        <Card title="Objetivos">
          <div className="grid g2">
            <SelectF table="goals" field="primaryGoal" value={g.primaryGoal} label="Prioridad" options={[{ v: "fat_loss", l: "Perder grasa conservando músculo" }, { v: "recomposition", l: "Recomposición" }, { v: "maintenance", l: "Mantener" }, { v: "performance", l: "Rendimiento" }]} />
            <Field label={`Ritmo: ${g.weightLossRatePct.toLocaleString("es-ES")} %/semana`} hint="Prudente: 0,25–0,75 %. Nunca más de 1 %.">
              <input type="range" min={0} max={1} step={0.25} value={g.weightLossRatePct} onChange={(e) => void patch("goals", "me", { weightLossRatePct: Number(e.target.value) })} />
            </Field>
          </div>
          <Notice kind="info">No calcularemos un objetivo calórico definitivo: verás un rango estimado con su fórmula y margen de error, y lo revisaremos con la tendencia de 3–4 semanas.</Notice>
          {nav}
        </Card>
      )}
      {step === 3 && (
        <Card title="Entrenamiento y disponibilidad">
          <div className="grid g2">
            <SelectF table="profiles" field="experience" value={p.experience} label="Experiencia" options={[{ v: "none", l: "Ninguna" }, { v: "beginner", l: "Principiante / retomando" }, { v: "intermediate", l: "Intermedia" }, { v: "advanced", l: "Avanzada" }]} />
            <SelectF table="preferences" field="activeTemplateId" value={pr.activeTemplateId} label="Rutina de fuerza" options={[{ v: "ppl-3d", l: "Empuje/Tracción/Piernas · 3 días" }, { v: "ul-2d", l: "Torso/Pierna · 2 días" }, { v: "fb-3d", l: "Full body · 3 días" }]} />
            <TextF table="profiles" field="injuries" value={p.injuries} label="Lesiones o limitaciones" multiline />
            <Toggle checked={pr.adaptationMode} onChange={(v) => void patch("preferences", "me", { adaptationMode: v })} label="Empezar en modo adaptación (2 series)" hint="Recomendado si vuelves tras un parón." />
          </div>
          <div className="field" style={{ marginTop: 12 }}><span>Material disponible</span></div>
          <ChipsF table="profiles" field="equipment" value={p.equipment} options={(Object.keys(EQUIPMENT_LABEL) as EquipmentId[]).map((id) => ({ id, label: EQUIPMENT_LABEL[id] }))} />
          <div className="field" style={{ marginTop: 12 }}><span>Minutos disponibles por día</span></div>
          <div className="grid g4" style={{ marginTop: 6 }}>
            {WEEKDAYS_ES.map((dd, i) => (
              <Field key={dd} label={dd}><NumInput value={p.availability[i as Weekday] ?? 0} ariaLabel={`Minutos el ${dd}`} inputMode="numeric" onChange={(n) => void patch("profiles", "me", { availability: { ...p.availability, [i]: n ?? 0 } })} /></Field>
            ))}
          </div>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <Field label="Carrera: 5 km recientes (min)" hint="Para ritmos orientativos"><NumInput value={p.runRef?.timeSec ? p.runRef.timeSec / 60 : null} ariaLabel="Tiempo 5 km" onChange={(n) => void patch("profiles", "me", { runRef: n ? { distanceKm: 5, timeSec: Math.round(n * 60) } : null })} /></Field>
            <Field label="Salidas en bici/semana"><NumInput value={p.bike?.perWeek ?? 0} ariaLabel="Bici por semana" inputMode="numeric" onChange={(n) => void patch("profiles", "me", { bike: { ...p.bike, perWeek: n ?? 0 } })} /></Field>
            <NumF table="profiles" field="stepsGoal" value={p.stepsGoal} label="Pasos/día (flexible)" />
          </div>
          {nav}
        </Card>
      )}
      {step === 4 && (
        <Card title="Comida">
          <div className="grid g3">
            <SelectF table="preferences" field="mealsPerDay" value={String(pr.mealsPerDay) as "4"} label="Comidas al día" options={[2, 3, 4, 5].map((n) => ({ v: String(n) as "4", l: String(n) }))} />
            <NumF table="preferences" field="cookingTimeMin" value={pr.cookingTimeMin} label="Minutos de cocina entre semana" />
            <SelectF table="preferences" field="budget" value={pr.budget} label="Presupuesto" options={[{ v: "low", l: "Ajustado" }, { v: "medium", l: "Medio" }, { v: "high", l: "Holgado" }]} />
          </div>
          <div className="field" style={{ marginTop: 12 }}><span>Alergias e intolerancias</span></div>
          <ChipsF table="preferences" field="allergies" value={pr.allergies} options={ALLERGENS} />
          {nav}
        </Card>
      )}
      {step === 5 && (
        <Card title="Diabetes" sub="Solo información que tú aportas. Nunca pedimos tus credenciales de LibreView.">
          <div className="grid g2">
            <SelectF table="diabetes_settings" field="diabetesType" value={d.diabetesType} label="Tipo" options={[{ v: "type1", l: "Tipo 1" }, { v: "other", l: "Otro" }, { v: "none", l: "Sin diabetes" }]} />
            <TextF table="diabetes_settings" field="cgmDevice" value={d.cgmDevice} label="Sensor" />
            <SelectF table="diabetes_settings" field="unit" value={d.unit} label="Unidad" options={[{ v: "mg/dL", l: "mg/dL" }, { v: "mmol/L", l: "mmol/L" }]} />
            <TextF table="diabetes_settings" field="treatmentDescription" value={d.treatmentDescription} label="Tratamiento (descripción)" multiline />
          </div>
          <Notice kind="warn">Los rangos de glucosa están en los valores por defecto del consenso internacional. Cámbialos en Ajustes → Diabetes por los que te indique tu equipo, y añade allí tu protocolo personal.</Notice>
          {nav}
        </Card>
      )}
      {step === 6 && (
        <Card title="Todo listo">
          <p className="small">Al continuar se generará tu <b>plan de la semana</b> (fuerza, carrera, bici y descanso según tu disponibilidad) y un <b>menú</b> con lista de la compra. Todo es editable y puedes bloquear días o comidas.</p>
          <p className="small muted">Siguiente paso recomendado: importar tu CSV de LibreView en Diabetes → Importar.</p>
          {busy && <Notice kind="info" icon="clock"><span role="status">{busy}</span></Notice>}
          {fail && <Notice kind="danger">No se pudo completar: {fail} Puedes <Link href="/">continuar sin plan</Link> y generarlo luego desde Plan → Regenerar.</Notice>}
          {nav}
        </Card>
      )}
      <p className="small" style={{ marginTop: 14 }}><Link href="/">Saltar por ahora</Link></p>
    </>
  );
}

function WeightQuick() {
  const [kg, setKg] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <Field label="Peso actual (kg)" hint={saved ? "Guardado" : "Se guarda como registro de hoy."}>
      <NumInput value={kg} ariaLabel="Peso actual" onChange={setKg} />
      <button className="btn sm" disabled={!kg || saved} onClick={async () => { await put("weight_entries", { date: localDate(), measuredAt: nowIso(), weightKg: kg!, source: "manual", note: "Onboarding" }); setSaved(true); }}>Guardar peso</button>
    </Field>
  );
}
