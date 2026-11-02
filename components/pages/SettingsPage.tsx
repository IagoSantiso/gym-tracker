"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card, Field, Icon, Notice, NumInput, PageHead, SourceBadge, Tabs, Toggle, confirmAction, useTabParam, useToast } from "@/components/ui";
import { ChipsF, ListF, NumF, SelectF, TextF } from "@/components/settings/fields";
import { useDiabetes, useGoals, useLive, usePreferences, useProfile, useTable } from "@/lib/db/hooks";
import { audit, nowIso, patch, put } from "@/lib/db/repo";
import { CONSENT_KINDS } from "@/lib/db/defaults";
import { EQUIPMENT_LABEL } from "@/lib/domain/training/library";
import { ALLERGENS } from "@/lib/domain/nutrition/foods";
import { WEEKDAYS_ES, formatDuration } from "@/lib/domain/time";
import { MGDL_PER_MMOL } from "@/lib/domain/units";
import type { ConsentKind, EquipmentId, TableName, Weekday } from "@/lib/db/types";
import { TABLES } from "@/lib/db/schema";
import { getSupabase, supabaseConfigured } from "@/lib/sync/supabase";
import { getSyncState, subscribeSync, syncNow, type SyncState } from "@/lib/sync/manager";
import { deleteEverything, download, exportAll, exportCsv, importBackup } from "@/lib/services/data";
import { importLegacy } from "@/lib/db/init";
import { importActivityFile, importDailyCsv } from "@/lib/services/integrations";
import { polarDisconnect, polarStatus, polarSync } from "@/lib/services/polar";
import { all } from "@/lib/db/repo";

const TABS = ["perfil", "objetivos", "preferencias", "diabetes", "privacidad", "integraciones", "sync", "datos"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const [tab, setTab] = useTabParam<Tab>("perfil", TABS);
  return (
    <>
      <PageHead eyebrow="Ajustes" title="Tu configuración">Todo es editable. Los valores clínicos solo los introduces tú, a partir de lo que te indique tu equipo sanitario.</PageHead>
      <Tabs label="Secciones de ajustes" value={tab} onChange={setTab} tabs={[
        { id: "perfil", label: "Perfil" }, { id: "objetivos", label: "Objetivos" }, { id: "preferencias", label: "Preferencias" },
        { id: "diabetes", label: "Diabetes" }, { id: "privacidad", label: "Privacidad e IA" }, { id: "integraciones", label: "Integraciones" },
        { id: "sync", label: "Sincronización" }, { id: "datos", label: "Mis datos" },
      ]} />
      {tab === "perfil" && <ProfileTab />}
      {tab === "objetivos" && <GoalsTab />}
      {tab === "preferencias" && <PrefsTab />}
      {tab === "diabetes" && <DiabetesTab />}
      {tab === "privacidad" && <PrivacyTab />}
      {tab === "integraciones" && <IntegrationsTab />}
      {tab === "sync" && <SyncTab />}
      {tab === "datos" && <DataTab />}
    </>
  );
}

function ProfileTab() {
  const p = useProfile();
  return (
    <div className="stack">
      {p.draft && (
        <Notice kind="warn">
          Perfil en <b>borrador</b>: se precargó con lo que contaste (diabetes tipo 1, Libre 2 Plus, carrera, bici, gimnasio, Polar). Revísalo y confírmalo.
          <div style={{ marginTop: 8 }}><button className="btn sm primary" onClick={() => void patch("profiles", "me", { draft: false })}>Confirmar perfil</button> <Link className="btn sm ghost" href="/onboarding">Asistente de configuración</Link></div>
        </Notice>
      )}
      <Card title="Datos básicos">
        <div className="grid g2">
          <TextF table="profiles" field="displayName" value={p.displayName} label="Nombre" />
          <TextF table="profiles" field="appName" value={p.appName} label="Nombre de la app" hint="Por defecto NEXO" />
          <TextF table="profiles" field="birthDate" value={p.birthDate} label="Fecha de nacimiento (opcional)" type="date" hint="Solo para estimar el gasto energético." />
          <SelectF table="profiles" field="sex" value={p.sex} label="Sexo biológico (opcional)" hint="Solo si quieres usar ecuaciones que lo requieren (Mifflin-St Jeor). Sin él se muestra un rango más amplio."
            options={[{ v: "", l: "Prefiero no indicarlo" }, { v: "female", l: "Mujer" }, { v: "male", l: "Hombre" }]} />
          <NumF table="profiles" field="heightCm" value={p.heightCm} label="Altura (cm)" min={100} max={250} />
          <TextF table="profiles" field="timezone" value={p.timezone} label="Zona horaria" hint="IANA, p. ej. Europe/Madrid" />
        </div>
      </Card>
      <Card title="Entrenamiento">
        <div className="grid g2">
          <SelectF table="profiles" field="experience" value={p.experience} label="Experiencia" options={[{ v: "none", l: "Ninguna" }, { v: "beginner", l: "Principiante / retomando" }, { v: "intermediate", l: "Intermedia" }, { v: "advanced", l: "Avanzada" }]} />
          <TextF table="profiles" field="watch" value={p.watch} label="Reloj" />
          <TextF table="profiles" field="injuries" value={p.injuries} label="Lesiones o limitaciones" multiline hint="Las tienes en cuenta tú y, si lo autorizas, el asistente." />
        </div>
        <div className="field" style={{ marginTop: 12 }}><span>Material disponible</span></div>
        <ChipsF table="profiles" field="equipment" value={p.equipment} options={(Object.keys(EQUIPMENT_LABEL) as EquipmentId[]).map((id) => ({ id, label: EQUIPMENT_LABEL[id] }))} />
        <div className="field" style={{ marginTop: 14 }}><span>Minutos disponibles por día</span></div>
        <div className="grid g4" style={{ marginTop: 6 }}>
          {WEEKDAYS_ES.map((d, i) => (
            <Field key={d} label={d}>
              <NumInput value={p.availability[i as Weekday] ?? 0} ariaLabel={`Minutos el ${d}`} inputMode="numeric"
                onChange={(n) => void patch("profiles", "me", { availability: { ...p.availability, [i]: n ?? 0 } })} />
            </Field>
          ))}
        </div>
      </Card>
      <Card title="Carrera, bici y movimiento">
        <div className="grid g3">
          <Field label="Marca reciente: distancia (km)"><NumInput value={p.runRef?.distanceKm ?? null} ariaLabel="Distancia de referencia" onChange={(n) => void patch("profiles", "me", { runRef: n ? { distanceKm: n, timeSec: p.runRef?.timeSec ?? 0 } : null })} /></Field>
          <Field label="Tiempo (minutos)" hint={p.runRef?.timeSec ? formatDuration(p.runRef.timeSec) : undefined}><NumInput value={p.runRef?.timeSec ? Math.round((p.runRef.timeSec / 60) * 100) / 100 : null} ariaLabel="Tiempo de referencia" onChange={(n) => void patch("profiles", "me", { runRef: { distanceKm: p.runRef?.distanceKm ?? 5, timeSec: Math.round((n ?? 0) * 60) } })} /></Field>
          <NumF table="profiles" field="stepsGoal" value={p.stepsGoal} label="Pasos diarios (orientativo)" hint="Objetivo flexible, no obligación." />
          <Field label="FC máxima (si la conoces)"><NumInput value={p.hr?.max ?? null} ariaLabel="FC máxima" inputMode="numeric" onChange={(n) => void patch("profiles", "me", { hr: { ...p.hr, max: n } })} /></Field>
          <Field label="FC reposo"><NumInput value={p.hr?.rest ?? null} ariaLabel="FC reposo" inputMode="numeric" onChange={(n) => void patch("profiles", "me", { hr: { ...p.hr, rest: n } })} /></Field>
          <Field label="FC umbral (LTHR)" hint="Si está configurada, las zonas usan % de LTHR."><NumInput value={p.hr?.lthr ?? null} ariaLabel="FC umbral" inputMode="numeric" onChange={(n) => void patch("profiles", "me", { hr: { ...p.hr, lthr: n } })} /></Field>
          <Field label="Salidas en bici por semana"><NumInput value={p.bike?.perWeek ?? 0} ariaLabel="Salidas en bici" inputMode="numeric" onChange={(n) => void patch("profiles", "me", { bike: { ...p.bike, perWeek: n ?? 0 } })} /></Field>
          <Field label="Duración típica (min)"><NumInput value={p.bike?.typicalMin ?? 60} ariaLabel="Duración bici" inputMode="numeric" onChange={(n) => void patch("profiles", "me", { bike: { ...p.bike, typicalMin: n ?? 60 } })} /></Field>
          <Toggle checked={!!p.bike?.hasPowerMeter} onChange={(v) => void patch("profiles", "me", { bike: { ...p.bike, hasPowerMeter: v } })} label="Tengo potenciómetro" hint="Sin él, la app no muestra ni estima potencia." />
        </div>
      </Card>
    </div>
  );
}

function GoalsTab() {
  const g = useGoals();
  return (
    <div className="stack">
      <Card title="Objetivo principal">
        <div className="grid g2">
          <SelectF table="goals" field="primaryGoal" value={g.primaryGoal} label="Prioridad" options={[{ v: "fat_loss", l: "Perder grasa conservando músculo" }, { v: "recomposition", l: "Recomposición (déficit pequeño)" }, { v: "maintenance", l: "Mantener" }, { v: "performance", l: "Rendimiento" }]} />
          <Field label={`Ritmo de pérdida: ${g.weightLossRatePct.toLocaleString("es-ES")} % del peso/semana`} hint="Prudente: 0,25–0,75 %. Máximo permitido 1 %.">
            <input type="range" min={0} max={1} step={0.25} value={g.weightLossRatePct} onChange={(e) => void patch("goals", "me", { weightLossRatePct: Number(e.target.value) })} />
          </Field>
          <NumF table="goals" field="targetWeightKg" value={g.targetWeightKg} label="Peso orientativo (opcional)" />
          <SelectF table="goals" field="strengthPriority" value={g.strengthPriority} label="Prioridad de fuerza" options={[{ v: "low", l: "Baja" }, { v: "medium", l: "Media" }, { v: "high", l: "Alta" }]} />
          <SelectF table="goals" field="endurancePriority" value={g.endurancePriority} label="Prioridad de resistencia" options={[{ v: "low", l: "Baja" }, { v: "medium", l: "Media" }, { v: "high", l: "Alta" }]} />
        </div>
      </Card>
      <Card title="Objetivo de carrera (opcional)">
        <div className="grid g3">
          <Field label="Distancia">
            <select value={g.raceGoal?.distanceKm ?? ""} onChange={(e) => void patch("goals", "me", { raceGoal: e.target.value ? { ...g.raceGoal, distanceKm: Number(e.target.value) } : null })}>
              <option value="">Sin objetivo</option><option value="5">5K</option><option value="10">10K</option><option value="21.0975">Media maratón</option>
            </select>
          </Field>
          <Field label="Fecha"><input type="date" value={g.raceGoal?.date ?? ""} onChange={(e) => g.raceGoal && void patch("goals", "me", { raceGoal: { ...g.raceGoal, date: e.target.value || null } })} /></Field>
          <Field label="Tiempo objetivo (min, opcional)"><NumInput value={g.raceGoal?.targetTimeSec ? g.raceGoal.targetTimeSec / 60 : null} ariaLabel="Tiempo objetivo" onChange={(n) => g.raceGoal && void patch("goals", "me", { raceGoal: { ...g.raceGoal, targetTimeSec: n ? Math.round(n * 60) : null } })} /></Field>
        </div>
      </Card>
      <Card title="Objetivo energético" sub="Por defecto se ESTIMA un rango; si tu dietista/endocrino te ha dado cifras, usa el modo acordado.">
        <div className="grid g2">
          <SelectF table="goals" field="calorieMode" value={g.calorieMode} label="Modo" options={[{ v: "estimated", l: "Estimado por la app (rango)" }, { v: "manual", l: "Acordado con un profesional" }]} />
          {g.calorieMode === "manual" && (
            <>
              <NumF table="goals" field="manualKcal" value={g.manualKcal} label="kcal/día" />
              <NumF table="goals" field="manualProteinG" value={g.manualProteinG} label="Proteína (g/día)" />
              <NumF table="goals" field="manualCarbsG" value={g.manualCarbsG} label="Hidratos (g/día, plan acordado)" />
              <NumF table="goals" field="manualFatG" value={g.manualFatG} label="Grasa (g/día)" />
              <TextF table="goals" field="manualSource" value={g.manualSource} label="Fuente" placeholder="p. ej. Dietista, consulta del 12/10/2026" />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function PrefsTab() {
  const p = usePreferences();
  const templates = useTable("workout_templates") ?? [];
  return (
    <div className="stack">
      <Card title="Comidas">
        <div className="grid g3">
          <SelectF table="preferences" field="mealsPerDay" value={String(p.mealsPerDay) as "3"} label="Comidas al día" options={[2, 3, 4, 5].map((n) => ({ v: String(n) as "3", l: n === 5 ? "5 (con pre/post entreno)" : String(n) }))} />
          <NumF table="preferences" field="cookingTimeMin" value={p.cookingTimeMin} label="Tiempo de cocina entre semana (min)" />
          <SelectF table="preferences" field="budget" value={p.budget} label="Presupuesto" options={[{ v: "low", l: "Ajustado" }, { v: "medium", l: "Medio" }, { v: "high", l: "Holgado" }]} />
        </div>
        <div className="field" style={{ marginTop: 12 }}><span>Alergias</span></div>
        <ChipsF table="preferences" field="allergies" value={p.allergies} options={ALLERGENS} />
        <div className="field" style={{ marginTop: 12 }}><span>Intolerancias</span></div>
        <ChipsF table="preferences" field="intolerances" value={p.intolerances} options={ALLERGENS.filter((a) => ["gluten", "lactosa"].includes(a.id))} />
        <div style={{ marginTop: 12 }}><ListF table="preferences" field="excludedFoods" value={p.excludedFoods} label="Alimentos que no quieres en el menú" hint="Por nombre, separados por comas (p. ej. «salmón, champiñones»)" /></div>
      </Card>
      <Card title="Entrenamiento">
        <div className="grid g2">
          <SelectF table="preferences" field="activeTemplateId" value={p.activeTemplateId} label="Rutina activa" options={templates.map((t) => ({ v: t.id, l: t.name }))} />
          <SelectF table="preferences" field="deloadEveryWeeks" value={p.deloadEveryWeeks ? String(p.deloadEveryWeeks) as "4" : ""} label="Semana de descarga" options={[{ v: "", l: "Manual" }, { v: "4" as const, l: "Cada 4 semanas" }, { v: "5" as const, l: "Cada 5 semanas" }, { v: "6" as const, l: "Cada 6 semanas" }]} />
          <Toggle checked={p.adaptationMode} onChange={(v) => void patch("preferences", "me", { adaptationMode: v })} label="Modo adaptación (máx. 2 series)" hint="Recomendado las primeras 2 semanas al retomar." />
          <Toggle checked={p.autoApplyProgression} onChange={(v) => void patch("preferences", "me", { autoApplyProgression: v })} label="Precargar la carga sugerida" hint="Si está desactivado, verás «Hoy: X kg» con un botón Aplicar." />
          <Field label="Recordatorio de pausa activa (min, con la app abierta)" hint="0 o vacío = desactivado.">
            <NumInput value={p.activeBreakReminderMin ?? null} ariaLabel="Minutos entre pausas" inputMode="numeric" onChange={(n) => void patch("preferences", "me", { activeBreakReminderMin: n || null })} />
          </Field>
        </div>
      </Card>
      <Card title="Apariencia">
        <div className="row">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} className="chip" aria-pressed={p.theme === t} onClick={() => void patch("preferences", "me", { theme: t })}>
              <Icon name={t === "dark" ? "moon" : "sun"} />{t === "system" ? "Sistema" : t === "light" ? "Claro" : "Oscuro"}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DiabetesTab() {
  const d = useDiabetes();
  const mm = d.unit === "mmol/L";
  const show = (mgdl: number) => (mm ? Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10 : mgdl);
  const setRange = (field: "targetLow" | "targetHigh" | "veryLow" | "veryHigh", v: number | null) => {
    if (v == null) return;
    const mgdl = mm ? Math.round(v * MGDL_PER_MMOL) : v;
    void patch("diabetes_settings", "me", { [field]: mgdl, targetsSource: "care_team", targetsSetAt: nowIso() });
    void audit("clinical_targets_changed", { field });
  };
  return (
    <div className="stack">
      <Notice kind="info" icon="shield">Esta sección guarda <b>tu</b> información. La app no calcula dosis, ratios ni correcciones, ni modifica estos valores por su cuenta.</Notice>
      <Card title="Diabetes y sensor">
        <div className="grid g2">
          <Toggle checked={d.enabled} onChange={(v) => void patch("diabetes_settings", "me", { enabled: v })} label="Mostrar módulo de diabetes" />
          <SelectF table="diabetes_settings" field="diabetesType" value={d.diabetesType} label="Tipo" options={[{ v: "type1", l: "Tipo 1" }, { v: "other", l: "Otro" }, { v: "none", l: "Sin diabetes" }]} />
          <TextF table="diabetes_settings" field="cgmDevice" value={d.cgmDevice} label="Sensor (MCG)" />
          <SelectF table="diabetes_settings" field="unit" value={d.unit} label="Unidad de glucosa" options={[{ v: "mg/dL", l: "mg/dL" }, { v: "mmol/L", l: "mmol/L" }]} />
          <TextF table="diabetes_settings" field="treatmentDescription" value={d.treatmentDescription} label="Tratamiento (descripción libre)" multiline hint="Solo descriptivo; no se usa para ningún cálculo." />
          <TextF table="diabetes_settings" field="hypoUnawareness" value={d.hypoUnawareness} label="Hipoglucemia inadvertida (opcional)" multiline />
        </div>
      </Card>
      <Card title="Rangos objetivo" sub={d.targetsSource === "care_team" ? `Indicados por tu equipo (actualizado ${d.targetsSetAt?.slice(0, 10) ?? "—"})` : "Por defecto: Consenso Internacional TIR 2019. Sustitúyelos por los de tu equipo sanitario."}
        right={<span className={`badge ${d.targetsSource === "care_team" ? "ok" : "warn"}`}>{d.targetsSource === "care_team" ? "De tu equipo" : "Por defecto"}</span>}>
        <div className="grid g4">
          <Field label={`Muy bajo < (${d.unit})`}><NumInput value={show(d.veryLow)} ariaLabel="Muy bajo" onChange={(v) => setRange("veryLow", v)} /></Field>
          <Field label={`Rango desde (${d.unit})`}><NumInput value={show(d.targetLow)} ariaLabel="Límite inferior" onChange={(v) => setRange("targetLow", v)} /></Field>
          <Field label={`Rango hasta (${d.unit})`}><NumInput value={show(d.targetHigh)} ariaLabel="Límite superior" onChange={(v) => setRange("targetHigh", v)} /></Field>
          <Field label={`Muy alto > (${d.unit})`}><NumInput value={show(d.veryHigh)} ariaLabel="Muy alto" onChange={(v) => setRange("veryHigh", v)} /></Field>
        </div>
        {d.targetsSource === "care_team" && <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => void patch("diabetes_settings", "me", { targetLow: 70, targetHigh: 180, veryLow: 54, veryHigh: 250, targetsSource: "default_consensus", targetsSetAt: null })}>Restaurar valores por defecto</button>}
      </Card>
      <Card title="Mi protocolo personal" sub="Copia aquí, tal cual, las indicaciones escritas de tu equipo (ejercicio, hipoglucemia, días de enfermedad). La app solo lo muestra.">
        <div className="stack">
          <TextF table="diabetes_settings" field="protocolText" value={d.protocolText} label="Protocolo" multiline />
          <div className="grid g2">
            <TextF table="diabetes_settings" field="protocolSource" value={d.protocolSource} label="Fuente" placeholder="p. ej. Endocrino, consulta 03/10/2026" />
            <TextF table="diabetes_settings" field="emergencyContacts" value={d.emergencyContacts} label="Contactos de emergencia" />
          </div>
        </div>
      </Card>
    </div>
  );
}

function PrivacyTab() {
  const consents = useTable("consents") ?? [];
  const set = async (kind: ConsentKind, granted: boolean) => {
    const c = consents.find((x) => x.kind === kind);
    await put("consents", { ...(c ?? { id: kind, kind, version: 1 }), kind, granted, grantedAt: granted ? nowIso() : c?.grantedAt ?? null, revokedAt: granted ? null : nowIso(), version: 1 });
    await audit("consent_change", { kind, granted });
  };
  const ai = consents.find((c) => c.kind === "ai_assistant")?.granted;
  return (
    <div className="stack">
      <Notice kind="info" icon="shield">Por defecto todo se queda en este dispositivo. Nada se envía a la nube ni a la IA sin que lo actives aquí, y puedes revocarlo en cualquier momento.</Notice>
      <Card title="Consentimientos">
        <div className="list">
          {CONSENT_KINDS.map((k) => {
            const c = consents.find((x) => x.kind === k.kind);
            const disabled = k.kind.startsWith("ai_") && k.kind !== "ai_assistant" && !ai;
            return (
              <div className="li" key={k.kind}>
                <div className="grow">
                  <div className="t">{k.label}</div>
                  <div className="s">{k.detail}</div>
                  {c?.grantedAt && c.granted && <div className="xs dim">Concedido el {c.grantedAt.slice(0, 10)}</div>}
                </div>
                <label className="switch" style={{ border: 0, padding: 0, background: "none" }}>
                  <input type="checkbox" aria-label={k.label} checked={!!c?.granted} disabled={disabled} onChange={(e) => void set(k.kind, e.target.checked)} />
                </label>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Asistente IA: qué se envía y a quién">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Proveedor configurado en el servidor: Claude (Anthropic) por defecto; OpenAI como alternativa. La clave nunca llega al navegador.</li>
          <li>Solo se envían tu pregunta y los resúmenes que el asistente pida con herramientas de <b>solo lectura</b>, limitados a las categorías activadas arriba.</li>
          <li>De glucosa solo se envían métricas agregadas del periodo (nunca lecturas individuales).</li>
          <li>Los proveedores de API no entrenan modelos con estos datos por defecto, pero conservan registros temporales de seguridad/abuso según sus políticas. Detalle en <code>docs/SAFETY_AND_PRIVACY.md</code>.</li>
          <li>El servidor no guarda conversaciones ni registra su contenido.</li>
        </ul>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const p = useProfile();
  const toast = useToast();
  const conns = useTable("integration_connections") ?? [];
  const jobs = useLive(async () => (await all("import_jobs")).sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 8), []) ?? [];
  const [polar, setPolar] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void polarStatus().then(setPolar); }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("polar");
    if (q) toast(q === "ok" ? "Polar conectado" : `Polar: ${q.replace(/_/g, " ")}`);
  }, [toast]);
  const pc = conns.find((c) => c.provider === "polar");
  const onFile = async (f: File | undefined, kind: "activity" | "steps" | "sleep") => {
    if (!f) return;
    try {
      const text = await f.text();
      if (kind === "activity") {
        const r = await importActivityFile(f.name, text, p.timezone);
        toast(`${r.created} actividades importadas · ${r.skipped} ya existían`);
      } else {
        const r = await importDailyCsv(kind, text);
        toast(`${r.created} días importados${r.errors.length ? ` · ${r.errors.length} filas descartadas` : ""}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo importar");
    }
  };
  return (
    <div className="stack">
      <Card title="Polar AccessLink" sub="Importa tus entrenamientos de Polar Flow (últimos 30 días). OAuth en el servidor; el token se guarda cifrado y no es accesible desde la web."
        right={<span className={`badge ${polar?.connected ? "ok" : ""}`}>{polar == null ? "Sin conexión" : !polar.configured ? "No configurado" : polar.connected ? "Conectado" : "Desconectado"}</span>}>
        {polar && !polar.configured && <Notice kind="info">Para activarlo, registra un cliente en admin.polaraccesslink.com y define <code>POLAR_CLIENT_ID</code>, <code>POLAR_CLIENT_SECRET</code>, <code>POLAR_REDIRECT_URI</code> y <code>TOKEN_ENCRYPTION_KEY</code> en el servidor.</Notice>}
        {pc?.lastSyncAt && <p className="small muted">Última sincronización: {pc.lastSyncAt.slice(0, 16).replace("T", " ")}{pc.lastError ? ` · Error: ${pc.lastError}` : ""}</p>}
        <div className="row" style={{ marginTop: 8 }}>
          {polar?.configured && !polar.connected && <a className="btn primary" href="/api/integrations/polar/authorize" onClick={() => void put("consents", { id: "polar", kind: "polar", granted: true, grantedAt: nowIso(), revokedAt: null, version: 1 })}>Conectar con Polar</a>}
          {polar?.connected && (
            <>
              <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const r = await polarSync(p.timezone); setBusy(false); toast("error" in r ? r.error : `${r.created} nuevas · ${r.skipped} ya estaban`); }}>
                <Icon name="sync" />{busy ? "Sincronizando…" : "Sincronizar ahora"}
              </button>
              <button className="btn danger" onClick={async () => { if (confirmAction("¿Desconectar Polar? Los entrenamientos ya importados se conservan.")) { await polarDisconnect(); setPolar({ configured: true, connected: false }); toast("Polar desconectado"); } }}>Desconectar</button>
            </>
          )}
        </div>
      </Card>
      <Card title="LibreView / LibreLink (Abbott)" sub="Abbott no ofrece API pública para pacientes. Exporta el CSV desde LibreView e impórtalo: no pedimos ni guardamos tu contraseña.">
        <Link className="btn" href="/diabetes?tab=importar"><Icon name="upload" />Importar CSV de glucosa</Link>
      </Card>
      <Card title="Archivos de actividad (TCX / GPX)" sub="Exporta desde Polar Flow u otra app. Se evitan duplicados.">
        <input type="file" accept=".tcx,.gpx,application/xml,text/xml" className="input" onChange={(e) => void onFile(e.target.files?.[0], "activity")} aria-label="Archivo TCX o GPX" />
      </Card>
      <Card title="Pasos y sueño (CSV)" sub="Formato: fecha (AAAA-MM-DD); valor. Pasos en número; sueño en horas.">
        <div className="grid g2">
          <Field label="Pasos"><input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0], "steps")} /></Field>
          <Field label="Sueño"><input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0], "sleep")} /></Field>
        </div>
      </Card>
      <Card title="Android Health Connect" right={<span className="badge">No disponible</span>}>
        <p className="small muted" style={{ margin: 0 }}>Health Connect es una API de Android en el dispositivo: una web/PWA no puede leerla. Está diseñado un companion Android (ver docs/INTEGRATIONS.md). Mientras, usa Polar o los CSV.</p>
      </Card>
      {jobs.length > 0 && (
        <Card title="Últimas importaciones">
          <div className="list">
            {jobs.map((j) => (
              <div className="li" key={j.id}>
                <div className="grow"><div className="t">{j.kind} {j.fileName ? `· ${j.fileName}` : ""}</div><div className="s">{j.importedAt.slice(0, 16).replace("T", " ")} · {j.created} creados · {j.skipped} omitidos{j.errors.length ? ` · ${j.errors.length} errores` : ""}</div></div>
                <SourceBadge source="imported" />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SyncTab() {
  const [s, setS] = useState<SyncState>(getSyncState());
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const consent = useTable("consents")?.find((c) => c.kind === "cloud_sync")?.granted;
  const jobs = useLive(async () => (await all("sync_jobs")).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5), []) ?? [];
  useEffect(() => { const un = subscribeSync(setS); return () => { un(); }; }, []);
  if (!supabaseConfigured()) {
    return (
      <Card title="Sincronización en la nube">
        <Notice kind="info">Esta instalación no tiene Supabase configurado: todo se guarda solo en este dispositivo. Para sincronizar entre dispositivos, crea un proyecto en Supabase, aplica <code>supabase/migrations</code> y define <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</Notice>
      </Card>
    );
  }
  const sb = getSupabase()!;
  return (
    <div className="stack">
      <Card title="Cuenta" sub="Acceso con enlace mágico por email (sin contraseñas).">
        {s.email ? (
          <div className="row between">
            <span>Sesión iniciada como <b>{s.email}</b></span>
            <button className="btn sm ghost" onClick={async () => { await sb.auth.signOut(); toast("Sesión cerrada"); void syncNow(); }}>Cerrar sesión</button>
          </div>
        ) : sent ? (
          <Notice kind="info">Te hemos enviado un enlace a {email}. Ábrelo en este dispositivo.</Notice>
        ) : (
          <div className="row">
            <input className="input" style={{ maxWidth: 320 }} type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <button className="btn primary" disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={async () => {
              const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/ajustes?tab=sync`, shouldCreateUser: true } });
              if (error) toast(error.message); else setSent(true);
            }}>Enviar enlace</button>
          </div>
        )}
      </Card>
      <Card title="Estado" right={<span className="badge">{s.status}</span>}>
        <Toggle checked={!!consent} label="Sincronizar mis datos con mi proyecto Supabase" hint="Los archivos originales de glucosa y las muestras de actividad nunca se suben."
          onChange={async (v) => { await put("consents", { id: "cloud_sync", kind: "cloud_sync", granted: v, grantedAt: v ? nowIso() : null, revokedAt: v ? null : nowIso(), version: 1 }); void syncNow(); }} />
        <p className="small muted">Pendientes de subir: {s.pending}. Última sincronización: {s.lastSyncAt?.slice(0, 16).replace("T", " ") ?? "—"}.{s.error && <><br />Error: {s.error}</>}</p>
        <button className="btn" onClick={() => void syncNow()}><Icon name="sync" />Sincronizar ahora</button>
        {jobs.length > 0 && <div className="xs dim" style={{ marginTop: 8 }}>{jobs.map((j) => `${j.startedAt.slice(11, 16)} ↑${j.pushed} ↓${j.pulled}${j.error ? " ⚠" : ""}`).join(" · ")}</div>}
      </Card>
    </div>
  );
}

function DataTab() {
  const toast = useToast();
  const [legacy, setLegacy] = useState("");
  const backupRef = useRef<HTMLTextAreaElement>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [table, setTable] = useState<TableName>("weight_entries");
  const restore = async (text: string) => {
    if (!confirmAction("La copia sustituirá los datos de este dispositivo (perfil, menús, plan, registros). ¿Continuar?")) return;
    setBusy(true);
    try {
      const r = await importBackup(text);
      if (backupRef.current) backupRef.current.value = "";
      setHasBackup(false);
      alert(`Copia restaurada: ${r.restored} registros.`);
      location.assign("/");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Copia no válida");
    } finally {
      setBusy(false);
    }
  };
  const copyBackup = async () => {
    const text = await (await exportAll()).text();
    try {
      await navigator.clipboard.writeText(text);
      toast("Copia copiada al portapapeles: pégala en Ajustes → Datos del otro dispositivo");
    } catch {
      toast("No se pudo copiar; usa «Compartir» o descarga el archivo");
    }
  };
  const shareBackup = async () => {
    const blob = await exportAll();
    const file = new File([blob], `nexo-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Copia NEXO" });
      else download(blob, file.name);
    } catch { /* cancelado */ }
  };
  return (
    <div className="stack">
      <Card title="Exportar" sub="Tus datos son tuyos: copia completa en JSON o tablas en CSV.">
        <div className="row">
          <button className="btn primary" onClick={async () => download(await exportAll(), `nexo-${new Date().toISOString().slice(0, 10)}.json`)}><Icon name="download" />Copia completa (JSON)</button>
          <button className="btn" onClick={() => void copyBackup()}>Copiar copia</button>
          <button className="btn" onClick={() => void shareBackup()}>Compartir</button>
          <select className="input" style={{ maxWidth: 240 }} value={table} onChange={(e) => setTable(e.target.value as TableName)} aria-label="Tabla a exportar">
            {TABLES.filter((t) => !t.serverOnly && t.name !== "raw_files").map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <button className="btn" onClick={async () => download(await exportCsv(table), `${table}.csv`)}>CSV</button>
        </div>
      </Card>
      <Card title="Restaurar copia" sub="Pega aquí el contenido completo de una copia JSON de NEXO (o elige el archivo). La copia sustituye a los datos de este dispositivo: perfil, menús, plan e historial.">
        <textarea ref={backupRef} className="input" style={{ minHeight: 110 }} onInput={(e) => setHasBackup(!!e.currentTarget.value.trim())} placeholder='{"app":"NEXO","schema":1,…}' aria-label="Copia JSON de NEXO" spellCheck={false} autoComplete="off" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={!hasBackup || busy} onClick={() => void restore(backupRef.current?.value ?? "")}>Restaurar copia pegada</button>
          <label className="btn ghost">Elegir archivo
            <input type="file" accept=".json,application/json,text/plain,*/*" style={{ display: "none" }} onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await restore(await f.text());
            }} aria-label="Archivo de copia" />
          </label>
        </div>
      </Card>
      <Card title="Importar datos del Gym Tracker v2 (HTML)" sub="Los datos de la versión de un solo archivo viven en otro origen. En esa página abre la consola del navegador y ejecuta el comando; pega aquí el resultado.">
        <pre className="xs" style={{ whiteSpace: "pre-wrap", background: "var(--bg2)", padding: 10, borderRadius: 10 }}>copy(JSON.stringify(Object.fromEntries(["gymLogs","gymLoads","gymUI","gymSets"].map(k=&gt;[k,JSON.parse(localStorage.getItem(k)||"null")]))))</pre>
        <textarea className="input" style={{ minHeight: 90 }} value={legacy} onChange={(e) => setLegacy(e.target.value)} placeholder='{"gymLogs":[…],"gymLoads":{…}}' aria-label="JSON del Gym Tracker v2" />
        <button className="btn" style={{ marginTop: 8 }} disabled={!legacy.trim()} onClick={async () => {
          let parsed: unknown;
          try { parsed = JSON.parse(legacy); } catch { return toast("JSON no válido"); }
          if ((parsed as { app?: string })?.app === "NEXO") { setLegacy(""); return void restore(JSON.stringify(parsed)); }
          const r = await importLegacy(parsed as Parameters<typeof importLegacy>[0]);
          toast(`${r.sessions} sesiones y ${r.sets} series importadas`);
          setLegacy("");
        }}>Importar</button>
      </Card>
      <Card title="Borrar todos mis datos" sub="Elimina todo de este dispositivo y, si has iniciado sesión, también de la nube. No se puede deshacer.">
        <button className="btn danger" onClick={async () => {
          if (!confirmAction("¿Borrar TODOS tus datos de este dispositivo (y de la nube si hay sesión)? Exporta antes si quieres conservarlos.")) return;
          if (!confirmAction("Confirmación final: esta acción es irreversible.")) return;
          const r = await deleteEverything({ remote: true });
          alert(r.remoteDeleted ? "Datos borrados en el dispositivo y en la nube." : "Datos borrados en este dispositivo.");
          location.href = "/";
        }}><Icon name="trash" />Borrar todo</button>
      </Card>
    </div>
  );
}
