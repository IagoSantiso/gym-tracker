"use client";
/** Modales de registro rápido. Todo se guarda primero en local; funcionan sin conexión. */
import { useEffect, useMemo, useState } from "react";
import { ActionButton, Field, Modal, Notice, NumInput, useToast } from "@/components/ui";
import { nowIso, put } from "@/lib/db/repo";
import { useDiabetes, useLive, useProfile } from "@/lib/db/hooks";
import { localDate, localTime, zonedWallToUtc } from "@/lib/domain/time";
import { toMgdl } from "@/lib/domain/units";
import { SPORT_LABEL, TYPE_LABEL } from "@/lib/domain/training/endurance";
import type { EnduranceType, GlucoseEventKind, MealSlot, Sport, UserNote } from "@/lib/db/types";
import { SLOT_LABEL } from "@/lib/domain/nutrition/recipes";
import { loadCatalog, logFreeMeal, logManualMeal } from "@/lib/services/nutrition";
import { recipeNutrition } from "@/lib/domain/nutrition/calc";
import { autoLinkPlanned } from "@/lib/services/training";
import { all } from "@/lib/db/repo";

export type QuickKind = "weight" | "meal" | "glucose" | "activity" | "note" | "checkin" | null;

/** Fecha y hora local editables → ISO UTC. */
function useWhen(tz: string) {
  const [date, setDate] = useState(localDate(Date.now(), tz));
  const [time, setTime] = useState(localTime(Date.now(), tz));
  const iso = () => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(zonedWallToUtc({ year: y, month: m, day: d, hour: hh, minute: mm }, tz).ms).toISOString();
  };
  const ui = (
    <div className="grid g2">
      <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
    </div>
  );
  return { date, iso, ui };
}

export function QuickLog({ kind, onClose }: { kind: QuickKind; onClose: () => void }) {
  return (
    <>
      {kind === "weight" && <WeightModal onClose={onClose} />}
      {kind === "meal" && <MealModal onClose={onClose} />}
      {kind === "glucose" && <GlucoseModal onClose={onClose} />}
      {kind === "activity" && <ActivityModal onClose={onClose} />}
      {kind === "note" && <NoteModal onClose={onClose} />}
      {kind === "checkin" && <CheckinModal onClose={onClose} />}
    </>
  );
}

function Footer({ onClose, onSave, disabled }: { onClose: () => void; onSave: () => unknown; disabled?: boolean }) {
  return (
    <>
      <button className="btn ghost" onClick={onClose}>Cancelar</button>
      <ActionButton className="btn primary" icon="check" busyLabel="Guardando…" disabled={disabled} onRun={async () => { await onSave(); }} success={null}>Guardar</ActionButton>
    </>
  );
}

function WeightModal({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const w = useWhen(p.timezone);
  const [kg, setKg] = useState<number | null>(null);
  const [waist, setWaist] = useState<number | null>(null);
  const toast = useToast();
  return (
    <Modal open title="Registrar peso" onClose={onClose} footer={<Footer onClose={onClose} disabled={!kg || kg < 25 || kg > 350} onSave={async () => {
      await put("weight_entries", { date: w.date, measuredAt: w.iso(), weightKg: kg!, source: "manual", note: null });
      if (waist) await put("body_measurements", { date: w.date, kind: "waist", value: waist, unit: "cm", source: "manual" });
      toast("Peso guardado");
      onClose();
    }} />}>
      <div className="stack">
        <Field label="Peso (kg)" hint="Mejor en condiciones parecidas cada vez (p. ej. al levantarte). La app mira la tendencia, no cada día.">
          <NumInput value={kg} onChange={setKg} ariaLabel="Peso en kg" placeholder="p. ej. 82,4" />
        </Field>
        <Field label="Cintura (cm, opcional)"><NumInput value={waist} onChange={setWaist} ariaLabel="Cintura en cm" /></Field>
        {w.ui}
      </div>
    </Modal>
  );
}

function MealModal({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const w = useWhen(p.timezone);
  const toast = useToast();
  const cat = useLive(() => loadCatalog(), []);
  const [mode, setMode] = useState<"recipe" | "foods" | "label">("recipe");
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState<number | null>(1);
  const [items, setItems] = useState<{ foodId: string; grams: number | null }[]>([{ foodId: "", grams: null }]);
  const [title, setTitle] = useState("");
  const [carbs, setCarbs] = useState<number | null>(null);
  const [kcal, setKcal] = useState<number | null>(null);
  const [prot, setProt] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const preview = useMemo(() => {
    if (!cat) return null;
    if (mode === "recipe" && recipeId) {
      const r = cat.recipe(recipeId);
      return r ? recipeNutrition(r.ingredients, cat.food, servings ?? 1, r.servings).totals : null;
    }
    if (mode === "foods") {
      const valid = items.filter((i) => i.foodId && i.grams);
      return valid.length ? recipeNutrition(valid.map((i) => ({ foodId: i.foodId, grams: i.grams!, note: null })), cat.food, 1, 1).totals : null;
    }
    return null;
  }, [cat, mode, recipeId, servings, items]);
  const save = async () => {
    if (mode === "recipe" && cat) {
      const r = cat.recipe(recipeId)!;
      const s = servings ?? 1;
      const k = s / r.servings;
      await logFreeMeal({ slot, title: `${r.name}${s !== 1 ? ` (×${s})` : ""}`, items: r.ingredients.map((i) => ({ foodId: i.foodId, grams: Math.round(i.grams * k) })), date: w.date, eatenAt: w.iso() });
    } else if (mode === "foods") {
      await logFreeMeal({ slot, title: title || "Comida", items: items.filter((i) => i.foodId && i.grams).map((i) => ({ foodId: i.foodId, grams: i.grams! })), date: w.date, eatenAt: w.iso() });
    } else {
      await logManualMeal({ slot, title: title || "Comida (etiqueta)", carbsG: carbs, kcal, proteinG: prot, fatG: fat, eatenAt: w.iso() });
    }
    toast("Comida registrada");
    onClose();
  };
  const can = mode === "recipe" ? !!recipeId : mode === "foods" ? items.some((i) => i.foodId && i.grams) : carbs != null || kcal != null;
  return (
    <Modal open title="Registrar comida" onClose={onClose} footer={<Footer onClose={onClose} onSave={save} disabled={!can} />}>
      <div className="stack">
        <div className="row">
          {(["recipe", "foods", "label"] as const).map((m) => (
            <button key={m} className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "recipe" ? "Receta" : m === "foods" ? "Alimentos" : "Solo etiqueta"}</button>
          ))}
        </div>
        <Field label="Momento">
          <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
            {(Object.keys(SLOT_LABEL) as MealSlot[]).map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
          </select>
        </Field>
        {mode === "recipe" && cat && (
          <div className="grid g2">
            <Field label="Receta">
              <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                <option value="">Elige…</option>
                {cat.recipes.filter((r) => r.slots.includes(slot) || true).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Raciones"><NumInput value={servings} onChange={setServings} ariaLabel="Raciones" /></Field>
          </div>
        )}
        {mode === "foods" && cat && (
          <>
            <Field label="Nombre (opcional)"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p. ej. Bocadillo" /></Field>
            {items.map((it, i) => (
              <div className="grid g2" key={i}>
                <Field label={`Alimento ${i + 1}`}>
                  <select value={it.foodId} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, foodId: e.target.value } : x)))}>
                    <option value="">Elige…</option>
                    {cat.foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
                <Field label="Gramos"><NumInput value={it.grams} onChange={(v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, grams: v } : x)))} ariaLabel="Gramos" /></Field>
              </div>
            ))}
            <button className="btn sm ghost" onClick={() => setItems((x) => [...x, { foodId: "", grams: null }])}>+ Añadir alimento</button>
          </>
        )}
        {mode === "label" && (
          <>
            <Field label="Descripción"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p. ej. Barrita de avena" /></Field>
            <div className="grid g3">
              <Field label="Hidratos (g)"><NumInput value={carbs} onChange={setCarbs} ariaLabel="Hidratos en gramos" /></Field>
              <Field label="Energía (kcal)"><NumInput value={kcal} onChange={setKcal} ariaLabel="Energía" /></Field>
              <Field label="Proteína (g)"><NumInput value={prot} onChange={setProt} ariaLabel="Proteína" /></Field>
              <Field label="Grasa (g)"><NumInput value={fat} onChange={setFat} ariaLabel="Grasa" /></Field>
            </div>
          </>
        )}
        {preview && (
          <div className="notice info">
            <div><b>{Math.round(preview.carbsAvailableG)} g</b> de hidratos disponibles · {Math.round(preview.kcal)} kcal · {Math.round(preview.proteinG)} g proteína · {Math.round(preview.fiberG)} g fibra <span className="badge src-calculated">Calculado</span>
              <div className="xs dim">Estimación a partir de valores de referencia; no es una indicación de dosis.</div></div>
          </div>
        )}
        {w.ui}
      </div>
    </Modal>
  );
}

const EVENT_KINDS: { id: GlucoseEventKind; label: string }[] = [
  { id: "fingerstick", label: "Glucemia capilar" }, { id: "insulin", label: "Insulina (registro histórico)" },
  { id: "hypo_treatment", label: "Tratamiento de hipoglucemia (registro)" }, { id: "illness", label: "Enfermedad" },
  { id: "stress", label: "Estrés" }, { id: "alcohol", label: "Alcohol" }, { id: "medication", label: "Otra medicación" },
  { id: "sleep", label: "Sueño" }, { id: "note", label: "Nota" },
];

function GlucoseModal({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const dia = useDiabetes();
  const w = useWhen(p.timezone);
  const toast = useToast();
  const [kind, setKind] = useState<GlucoseEventKind>("fingerstick");
  const [value, setValue] = useState<number | null>(null);
  const [insulinType, setInsulinType] = useState<"rapid" | "long" | "other">("rapid");
  const [note, setNote] = useState("");
  const save = async () => {
    const unit = kind === "fingerstick" ? dia.unit : kind === "insulin" ? "U" : kind === "hypo_treatment" ? "g" : null;
    const v = kind === "fingerstick" && value != null ? Math.round(toMgdl(value, dia.unit) * 10) / 10 : value;
    await put("glucose_events", {
      ts: w.iso(), kind, value: v, unit: kind === "fingerstick" ? "mg/dL" : unit, insulinType: kind === "insulin" ? insulinType : null,
      note: [note.trim(), kind === "fingerstick" && dia.unit === "mmol/L" && value != null ? `(introducido ${value} mmol/L)` : ""].filter(Boolean).join(" ") || null,
      source: "manual", importId: null, dedupeKey: null,
    });
    toast("Evento guardado");
    onClose();
  };
  return (
    <Modal open title="Registrar glucemia o evento" onClose={onClose} footer={<Footer onClose={onClose} onSave={save} disabled={["fingerstick", "insulin"].includes(kind) && value == null} />}>
      <div className="stack">
        <Field label="Tipo">
          <select value={kind} onChange={(e) => setKind(e.target.value as GlucoseEventKind)}>
            {EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        {kind === "fingerstick" && <Field label={`Valor (${dia.unit})`}><NumInput value={value} onChange={setValue} ariaLabel="Glucemia" /></Field>}
        {kind === "insulin" && (
          <>
            <Notice kind="info">Solo como <b>dato histórico</b> de lo que ya te has administrado. La app nunca calcula ni sugiere dosis.</Notice>
            <div className="grid g2">
              <Field label="Unidades administradas"><NumInput value={value} onChange={setValue} ariaLabel="Unidades" /></Field>
              <Field label="Tipo">
                <select value={insulinType} onChange={(e) => setInsulinType(e.target.value as "rapid" | "long" | "other")}>
                  <option value="rapid">Rápida</option><option value="long">Lenta/basal</option><option value="other">Otra</option>
                </select>
              </Field>
            </div>
          </>
        )}
        {kind === "hypo_treatment" && <Field label="Hidratos tomados (g, registro)"><NumInput value={value} onChange={setValue} ariaLabel="Gramos" /></Field>}
        <Field label="Nota (opcional)"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {w.ui}
      </div>
    </Modal>
  );
}

function ActivityModal({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const w = useWhen(p.timezone);
  const toast = useToast();
  const shoes = useLive(() => all("shoes"), []) ?? [];
  const [sport, setSport] = useState<Sport>("run");
  const [type, setType] = useState<EnduranceType>("easy");
  const [min, setMin] = useState<number | null>(40);
  const [km, setKm] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(4);
  const [avgHr, setAvgHr] = useState<number | null>(null);
  const [maxHr, setMaxHr] = useState<number | null>(null);
  const [elev, setElev] = useState<number | null>(null);
  const [power, setPower] = useState<number | null>(null);
  const [indoor, setIndoor] = useState(false);
  const [speed, setSpeed] = useState<number | null>(5);
  const [incline, setIncline] = useState<number | null>(2);
  const [steps, setSteps] = useState<number | null>(null);
  const [working, setWorking] = useState(true);
  const [shoeId, setShoeId] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (sport === "treadmill" && speed && min) setKm(Math.round(((speed * min) / 60) * 100) / 100);
  }, [sport, speed, min]);
  const save = async () => {
    const rec = await put("endurance_sessions", {
      sport, date: w.date, startedAt: w.iso(), durationSec: Math.round((min ?? 0) * 60), distanceM: km != null ? Math.round(km * 1000) : null,
      elevationGainM: elev, avgHr, maxHr, rpe, avgPowerW: sport === "bike" ? power : null, indoor: sport === "bike" ? indoor : sport === "treadmill" ? true : null,
      treadmillSpeedKmh: sport === "treadmill" ? speed : null, treadmillInclinePct: sport === "treadmill" ? incline : null, steps,
      sessionType: sport === "run" || sport === "bike" ? type : null, whileWorking: sport === "treadmill" ? working : null,
      shoeId: sport === "run" && shoeId ? shoeId : null, plannedItemId: null, title: null, notes: notes.trim() || null, hrZonesSec: null,
      source: "manual", externalId: null, importId: null,
    });
    const kindMap: Record<Sport, ("run" | "bike" | "walk" | "mobility")[]> = { run: ["run"], bike: ["bike"], walk: ["walk"], treadmill: ["walk"], mobility: ["mobility"], swim: [], other: [] };
    if (kindMap[sport].length) await autoLinkPlanned(kindMap[sport], rec.id, "endurance_sessions", w.date);
    toast("Actividad guardada");
    onClose();
  };
  return (
    <Modal open title="Registrar actividad" onClose={onClose} footer={<Footer onClose={onClose} onSave={save} disabled={!min} />}>
      <div className="stack">
        <div className="row">
          {(["run", "bike", "walk", "treadmill", "mobility"] as Sport[]).map((s) => <button key={s} className="chip" aria-pressed={sport === s} onClick={() => setSport(s)}>{SPORT_LABEL[s]}</button>)}
        </div>
        {(sport === "run" || sport === "bike") && (
          <Field label="Tipo de sesión">
            <select value={type} onChange={(e) => setType(e.target.value as EnduranceType)}>
              {(sport === "run" ? ["recovery", "easy", "long", "tempo", "intervals", "hills", "technique", "race"] : ["easy", "endurance", "tempo", "intervals", "commute"]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t as EnduranceType]}</option>)}
            </select>
          </Field>
        )}
        <div className="grid g3">
          <Field label="Duración (min)"><NumInput value={min} onChange={setMin} ariaLabel="Duración" /></Field>
          {sport === "treadmill" ? (
            <>
              <Field label="Velocidad (km/h)"><NumInput value={speed} onChange={setSpeed} ariaLabel="Velocidad" /></Field>
              <Field label="Inclinación (%)"><NumInput value={incline} onChange={setIncline} ariaLabel="Inclinación" /></Field>
            </>
          ) : sport !== "mobility" && <Field label="Distancia (km)"><NumInput value={km} onChange={setKm} ariaLabel="Distancia" /></Field>}
          <Field label="RPE (0–10)" hint="Esfuerzo percibido"><NumInput value={rpe} onChange={setRpe} min={0} max={10} ariaLabel="RPE" /></Field>
        </div>
        {sport === "treadmill" && (
          <label className="switch"><input type="checkbox" checked={working} onChange={(e) => setWorking(e.target.checked)} /><span>Mientras teletrabajaba</span></label>
        )}
        {sport !== "mobility" && (
          <div className="grid g3">
            <Field label="FC media"><NumInput value={avgHr} onChange={setAvgHr} ariaLabel="FC media" inputMode="numeric" /></Field>
            <Field label="FC máx."><NumInput value={maxHr} onChange={setMaxHr} ariaLabel="FC máxima" inputMode="numeric" /></Field>
            {sport === "walk" || sport === "treadmill" ? <Field label="Pasos"><NumInput value={steps} onChange={setSteps} ariaLabel="Pasos" inputMode="numeric" /></Field>
              : <Field label="Desnivel + (m)"><NumInput value={elev} onChange={setElev} ariaLabel="Desnivel" /></Field>}
          </div>
        )}
        {sport === "bike" && (
          <div className="grid g2">
            <Field label="Potencia media (W)" hint="Solo si tienes potenciómetro; no se estima."><NumInput value={power} onChange={setPower} ariaLabel="Potencia" /></Field>
            <label className="switch" style={{ alignSelf: "end" }}><input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} /><span>Interior (rodillo)</span></label>
          </div>
        )}
        {sport === "run" && shoes.length > 0 && (
          <Field label="Zapatillas">
            <select value={shoeId} onChange={(e) => setShoeId(e.target.value)}><option value="">—</option>{shoes.filter((s) => !s.retired).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
        )}
        <Field label="Notas"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {w.ui}
      </div>
    </Modal>
  );
}

function NoteModal({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const toast = useToast();
  const [kind, setKind] = useState<UserNote["kind"]>("energy");
  const [level, setLevel] = useState(3);
  const [text, setText] = useState("");
  const labels: Record<UserNote["kind"], string> = { energy: "Energía", hunger: "Hambre", stress: "Estrés", pain: "Dolor", fatigue: "Fatiga", general: "General" };
  return (
    <Modal open title="Añadir nota" onClose={onClose} footer={<Footer onClose={onClose} onSave={async () => {
      await put("user_notes", { ts: nowIso(), date: localDate(Date.now(), p.timezone), kind, level: kind === "general" ? null : level, body: text.trim() || labels[kind] });
      toast("Nota guardada");
      onClose();
    }} />}>
      <div className="stack">
        <div className="row">{(Object.keys(labels) as UserNote["kind"][]).map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{labels[k]}</button>)}</div>
        {kind !== "general" && <Field label={`Nivel: ${level}/5`}><input type="range" min={1} max={5} value={level} onChange={(e) => setLevel(Number(e.target.value))} /></Field>}
        {kind === "pain" && <Notice kind="warn">Si el dolor es intenso, persistente o articular, consulta con un profesional antes de entrenar esa zona.</Notice>}
        <Field label="Texto"><textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function CheckinModal({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const toast = useToast();
  const date = localDate(Date.now(), p.timezone);
  const [v, setV] = useState({ sleepHours: 7 as number | null, sleepQuality: 3, energy: 3, fatigue: 3, soreness: 2, stress: 3, hunger: 3, pain: "" });
  const scale = (k: "sleepQuality" | "energy" | "fatigue" | "soreness" | "stress" | "hunger", label: string, hint: string) => (
    <Field label={`${label}: ${v[k]}/5`} hint={hint}>
      <input type="range" min={1} max={5} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <Modal open title="¿Cómo estás hoy?" onClose={onClose} footer={<Footer onClose={onClose} onSave={async () => {
      await put("recovery_checkins", { id: `checkin-${date}`, date, sleepHours: v.sleepHours, sleepQuality: v.sleepQuality, energy: v.energy, fatigue: v.fatigue, soreness: v.soreness, stress: v.stress, hunger: v.hunger, pain: v.pain.trim() || null, notes: null });
      toast("Check-in guardado");
      onClose();
    }} />}>
      <div className="stack">
        <p className="small muted">Recuperación <b>percibida</b>: no es una medida médica. Sirve para ajustar el plan si lo necesitas.</p>
        <Field label="Horas de sueño"><NumInput value={v.sleepHours} onChange={(n) => setV({ ...v, sleepHours: n })} ariaLabel="Horas de sueño" /></Field>
        {scale("sleepQuality", "Calidad del sueño", "1 = muy mala · 5 = muy buena")}
        {scale("energy", "Energía", "1 = sin energía · 5 = mucha")}
        {scale("fatigue", "Fatiga", "1 = fresco · 5 = muy fatigado")}
        {scale("soreness", "Agujetas", "1 = nada · 5 = muchas")}
        {scale("stress", "Estrés", "1 = bajo · 5 = alto")}
        {scale("hunger", "Hambre", "1 = poca · 5 = mucha")}
        <Field label="Dolor o molestias (opcional)"><input value={v.pain} onChange={(e) => setV({ ...v, pain: e.target.value })} placeholder="p. ej. rodilla derecha al bajar escaleras" /></Field>
      </div>
    </Modal>
  );
}
