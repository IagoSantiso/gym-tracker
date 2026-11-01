/**
 * Inicialización idempotente: crea singletons por defecto, siembra rutinas y migra
 * los datos del Gym Tracker v2 (localStorage: gymLogs, gymLoads, gymSets, gymUI).
 */
import { getMeta, setMeta, tbl } from "./db";
import { CONSENT_KINDS, DEFAULT_DIABETES, DEFAULT_GOALS, DEFAULT_PREFERENCES, DEFAULT_PROFILE, defaultConsent } from "./defaults";
import { bulkPut, put, nowIso } from "./repo";
import { SEED_TEMPLATES } from "@/lib/domain/training/templates";
import { localDate } from "@/lib/domain/time";
import { PLANS } from "@/lib/domain/training/original";
import type { ExerciseSet } from "./types";

let initPromise: Promise<void> | null = null;

export function ensureInitialized(): Promise<void> {
  initPromise ??= doInit().catch((e) => {
    initPromise = null;
    throw e;
  });
  return initPromise;
}

async function doInit() {
  if (!(await tbl("profiles").get("me"))) await put("profiles", DEFAULT_PROFILE);
  if (!(await tbl("goals").get("me"))) await put("goals", DEFAULT_GOALS);
  if (!(await tbl("preferences").get("me"))) await put("preferences", DEFAULT_PREFERENCES);
  if (!(await tbl("diabetes_settings").get("me"))) await put("diabetes_settings", DEFAULT_DIABETES);
  for (const c of CONSENT_KINDS) if (!(await tbl("consents").get(c.kind))) await put("consents", defaultConsent(c.kind));
  for (const t of SEED_TEMPLATES) if (!(await tbl("workout_templates").get(t.id))) await put("workout_templates", t);
  if (!(await getMeta("legacyMigrated", false))) {
    await migrateLegacyFromLocalStorage();
    await setMeta("legacyMigrated", true);
  }
}

export interface LegacyData {
  gymLogs?: { date: string; ts: number; title: string; count: number; vol: number }[];
  gymLoads?: Record<string, { weight?: string; reps?: string }>;
  gymUI?: { mode?: number; day?: number; adapt?: boolean };
  gymSets?: Record<string, boolean[]>;
}

function readLegacy(): LegacyData | null {
  if (typeof localStorage === "undefined") return null;
  const get = (k: string) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : undefined;
    } catch {
      return undefined;
    }
  };
  const d: LegacyData = { gymLogs: get("gymLogs"), gymLoads: get("gymLoads"), gymUI: get("gymUI"), gymSets: get("gymSets") };
  return d.gymLogs || d.gymLoads || d.gymUI ? d : null;
}

export async function migrateLegacyFromLocalStorage() {
  const d = readLegacy();
  if (d) await importLegacy(d);
}

/** Importa datos v2 (también usado por la importación manual pegando JSON). */
export async function importLegacy(d: LegacyData): Promise<{ sessions: number; sets: number }> {
  let sessions = 0;
  let sets = 0;
  const now = nowIso();
  // Sesiones guardadas (sin detalle por serie en v2)
  for (const l of d.gymLogs ?? []) {
    if (!l || typeof l.ts !== "number") continue;
    const id = `legacy-log-${l.ts}`;
    if (await tbl("workout_sessions").get(id)) continue;
    const at = new Date(l.ts).toISOString();
    await put("workout_sessions", {
      id, date: localDate(l.ts), startedAt: at, endedAt: at, title: String(l.title ?? "Sesión"), status: "completed",
      deload: false, adaptation: false, source: "imported",
      notes: `Importada de Gym Tracker v2: ${l.count ?? 0} ejercicios, ${l.vol ?? 0} series (sin detalle por serie).`,
    });
    sessions++;
  }
  // Últimas cargas por ejercicio → una sesión "Cargas importadas" con series reconstruidas
  const loads = d.gymLoads ?? {};
  const entries = Object.entries(loads).filter(([, v]) => v && (v.weight || v.reps));
  if (entries.length && !(await tbl("workout_sessions").get("legacy-loads"))) {
    await put("workout_sessions", {
      id: "legacy-loads", date: localDate(), startedAt: now, endedAt: now, title: "Cargas importadas (Gym Tracker v2)",
      status: "completed", deload: false, adaptation: false, source: "imported",
      notes: "Peso y repeticiones de la última vez guardados en la versión anterior.",
    });
    sessions++;
    const rows: Omit<ExerciseSet, "createdAt" | "updatedAt">[] = [];
    entries.forEach(([key, v], order) => {
      const [mode, day, exerciseId] = key.split("-");
      const plan = PLANS[(Number(mode) === 2 ? 2 : 3) as 2 | 3]?.[Number(day)];
      const item = plan?.items.find((i) => i.id === exerciseId);
      const weight = v.weight ? Number(String(v.weight).replace(",", ".")) : null;
      const repsList = String(v.reps ?? "").split(/[\/,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      const list = repsList.length ? repsList : [null];
      list.forEach((r, i) =>
        rows.push({
          id: `legacy-${key}-${i}`, sessionId: "legacy-loads", exerciseId, exerciseOrder: order, setIndex: i,
          weightKg: Number.isFinite(weight) ? weight : null, reps: r, rir: null, completed: true, completedAt: now,
          isWarmup: false, targetRepsMin: null, targetRepsMax: null, notes: item ? null : "Ejercicio fuera del plan original",
        }),
      );
    });
    await bulkPut("exercise_sets", rows);
    sets = rows.length;
  }
  if (d.gymUI) {
    const prefs = await tbl("preferences").get("me");
    if (prefs) {
      await put("preferences", {
        ...prefs,
        strengthDaysPerWeek: d.gymUI.mode === 2 ? 2 : 3,
        activeTemplateId: d.gymUI.mode === 2 ? "ul-2d" : "ppl-3d",
        adaptationMode: !!d.gymUI.adapt,
      });
    }
  }
  if (sessions || sets) {
    await put("import_jobs", { kind: "legacy_v2", status: "ok", created: sessions + sets, skipped: 0, errors: [], importedAt: now, fileName: null });
  }
  return { sessions, sets };
}
