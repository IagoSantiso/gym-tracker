/**
 * Registro ÚNICO de tablas. De aquí se derivan:
 *  - stores e índices de IndexedDB (lib/db/db.ts)
 *  - la migración SQL de Supabase (scripts/generate-sql.mts → supabase/migrations)
 *  - la lista blanca de columnas que sincroniza el cliente (lib/sync)
 *
 * Notación de columnas: "tipo" + "!" (NOT NULL) + ">tabla" (FK compuesta (user_id, col)).
 * Tipos: text | int | numeric | bool | date | timestamptz | jsonb
 * Columnas base implícitas: id, createdAt, updatedAt, deletedAt.
 */
import type { TableName } from "./types";

export type ColType = "text" | "int" | "numeric" | "bool" | "date" | "timestamptz" | "jsonb";

export interface TableDef {
  name: TableName;
  /** se sincroniza con Supabase */
  sync: boolean;
  /** solo existe en el servidor (no en IndexedDB) */
  serverOnly?: boolean;
  /** índices Dexie adicionales (sintaxis Dexie, camelCase) */
  indexes?: string[];
  columns: Record<string, string>;
  /** restricciones UNIQUE (camelCase) además de la PK */
  uniques?: string[][];
  comment: string;
}

export const SCHEMA_VERSION = 1;

export const TABLES: TableDef[] = [
  /* ── Perfil ── */
  {
    name: "profiles", sync: true, comment: "Perfil (singleton id='me')",
    columns: {
      displayName: "text!", appName: "text!", birthDate: "date", sex: "text", heightCm: "numeric",
      timezone: "text!", locale: "text!", experience: "text", injuries: "text", equipment: "jsonb!",
      availability: "jsonb!", runRef: "jsonb", hr: "jsonb", bike: "jsonb", stepsGoal: "int", watch: "text",
      onboardingCompletedAt: "timestamptz", draft: "bool",
    },
  },
  {
    name: "goals", sync: true, comment: "Objetivos (singleton)",
    columns: {
      primaryGoal: "text!", weightLossRatePct: "numeric!", targetWeightKg: "numeric", strengthPriority: "text!",
      endurancePriority: "text!", raceGoal: "jsonb", calorieMode: "text!", manualKcal: "numeric",
      manualProteinG: "numeric", manualCarbsG: "numeric", manualFatG: "numeric", manualSource: "text", notes: "text",
    },
  },
  {
    name: "preferences", sync: true, comment: "Preferencias (singleton)",
    columns: {
      favoriteExerciseIds: "jsonb", foodContext: "jsonb", theme: "text!", mealsPerDay: "int!", allergies: "jsonb!", intolerances: "jsonb!", excludedFoods: "jsonb!",
      cookingTimeMin: "int!", budget: "text!", autoApplyProgression: "bool!", adaptationMode: "bool!",
      deloadEveryWeeks: "int", deloadActiveWeek: "date", activeBreakReminderMin: "int",
      strengthDaysPerWeek: "int!", activeTemplateId: "text", compensationMaxPct: "int",
    },
  },
  {
    name: "consents", sync: true, comment: "Consentimientos granulares (id = tipo)",
    indexes: ["kind"],
    columns: { kind: "text!", granted: "bool!", grantedAt: "timestamptz", revokedAt: "timestamptz", version: "int!" },
  },
  {
    name: "diabetes_settings", sync: true, comment: "Configuración de diabetes (singleton). Rangos en mg/dL.",
    columns: {
      enabled: "bool!", diabetesType: "text!", cgmDevice: "text", unit: "text!", treatmentDescription: "text",
      targetLow: "numeric!", targetHigh: "numeric!", veryLow: "numeric!", veryHigh: "numeric!",
      targetsSource: "text!", targetsSetAt: "timestamptz", hypoUnawareness: "text", protocolText: "text",
      protocolSource: "text", protocolUpdatedAt: "timestamptz", emergencyContacts: "text",
    },
  },
  /* ── Cuerpo y hábitos ── */
  {
    name: "weight_entries", sync: true, comment: "Peso corporal", indexes: ["date"],
    columns: { date: "date!", measuredAt: "timestamptz!", weightKg: "numeric!", source: "text!", note: "text" },
  },
  {
    name: "body_measurements", sync: true, comment: "Perímetros y composición", indexes: ["date", "kind"],
    columns: { date: "date!", kind: "text!", value: "numeric!", unit: "text!", source: "text!" },
  },
  {
    name: "recovery_checkins", sync: true, comment: "Recuperación percibida (no readiness médica)", indexes: ["date"],
    columns: {
      date: "date!", sleepHours: "numeric", sleepQuality: "int", energy: "int", fatigue: "int", soreness: "int",
      stress: "int", hunger: "int", pain: "text", notes: "text",
    },
  },
  {
    name: "habit_entries", sync: true, comment: "Hábitos/experimentos", indexes: ["date", "experimentId"],
    columns: { date: "date!", habit: "text!", done: "bool!", experimentId: "text>experiments", note: "text" },
  },
  {
    name: "user_notes", sync: true, comment: "Notas de energía, hambre, estrés, dolor o fatiga", indexes: ["date", "ts"],
    columns: { ts: "timestamptz!", date: "date!", kind: "text!", level: "int", body: "text!" },
  },
  /* ── Entrenamiento ── */
  {
    name: "exercises", sync: true, comment: "Ejercicios personalizados (la biblioteca base está en código)",
    columns: {
      name: "text!", muscleGroup: "text!", primaryMuscles: "jsonb!", secondaryMuscles: "jsonb!", equipment: "jsonb!", category: "text!",
      restSec: "int!", cues: "jsonb!", notes: "text", source: "text!",
    },
  },
  {
    name: "workout_templates", sync: true, comment: "Rutinas (agregado días → ejercicios)",
    columns: { name: "text!", kind: "text!", days: "jsonb!", source: "text!", description: "text" },
  },
  {
    name: "workout_sessions", sync: true, comment: "Sesiones de fuerza", indexes: ["date", "status", "plannedItemId"],
    columns: {
      date: "date!", startedAt: "timestamptz!", endedAt: "timestamptz", templateId: "text", dayIndex: "int",
      title: "text!", status: "text!", plannedItemId: "text", rpe: "numeric", durationMin: "numeric",
      deload: "bool!", adaptation: "bool!", notes: "text", source: "text!",
    },
  },
  {
    name: "exercise_sets", sync: true, comment: "Series registradas",
    indexes: ["sessionId", "exerciseId", "[sessionId+exerciseId]"],
    columns: {
      sessionId: "text!>workout_sessions", exerciseId: "text!", exerciseOrder: "int!", setIndex: "int!",
      durationSec: "int", weightKg: "numeric", reps: "int", rir: "numeric", completed: "bool!", completedAt: "timestamptz",
      isWarmup: "bool!", targetRepsMin: "int", targetRepsMax: "int", notes: "text",
    },
  },
  {
    name: "shoes", sync: true, comment: "Calzado y kilometraje",
    columns: { name: "text!", startKm: "numeric!", retired: "bool!", notes: "text" },
  },
  {
    name: "endurance_sessions", sync: true, comment: "Carrera, bici, caminata, cinta, movilidad",
    indexes: ["date", "sport", "externalId", "plannedItemId"],
    uniques: [["externalId"]],
    columns: {
      sport: "text!", date: "date!", startedAt: "timestamptz!", durationSec: "int!", distanceM: "numeric",
      elevationGainM: "numeric", avgHr: "int", maxHr: "int", rpe: "numeric", avgPowerW: "numeric", indoor: "bool",
      treadmillSpeedKmh: "numeric", treadmillInclinePct: "numeric", steps: "int", sessionType: "text",
      whileWorking: "bool", shoeId: "text>shoes", plannedItemId: "text", title: "text", notes: "text",
      hrZonesSec: "jsonb", source: "text!", externalId: "text", importId: "text",
    },
  },
  {
    name: "activity_streams", sync: false, comment: "Muestras de TCX/GPX (solo local)", indexes: ["sessionId"],
    columns: { sessionId: "text!", points: "jsonb!" },
  },
  {
    name: "daily_activity", sync: true, comment: "Pasos y minutos activos", indexes: ["date", "externalId"],
    columns: { nutritionSignature: "text", date: "date!", steps: "int", activeMin: "int", source: "text!", externalId: "text" },
  },
  {
    name: "sleep_records", sync: true, comment: "Sueño", indexes: ["date"],
    columns: { date: "date!", durationMin: "int!", quality: "int", source: "text!", externalId: "text" },
  },
  /* ── Planificación ── */
  {
    name: "plan_weeks", sync: true, comment: "Plan ORIGINAL de cada semana (instantánea)", indexes: ["weekStart"],
    columns: {
      weekStart: "date!", original: "jsonb!", generatorVersion: "text!", generatedAt: "timestamptz!",
      lockedDays: "jsonb!", notes: "text",
    },
  },
  {
    name: "planned_items", sync: true, comment: "Plan VIGENTE (y enlace a la actividad real)",
    indexes: ["date", "weekStart", "status"],
    columns: {
      date: "date!", weekStart: "date!", kind: "text!", title: "text!", intensity: "text!", durationMin: "int!",
      templateId: "text", dayIndex: "int", runSpec: "jsonb", loadsLegs: "bool", sortOrder: "int!", notes: "text",
      status: "text!", locked: "bool!", originalDate: "date", actualRef: "jsonb", source: "text!",
    },
  },
  {
    name: "proposals", sync: true, comment: "Cambios sugeridos (reglas o IA) con trazabilidad",
    indexes: ["status", "domain"],
    columns: {
      domain: "text!", kind: "text!", title: "text!", summary: "text!", reasons: "jsonb!", dataUsed: "jsonb!",
      assumptions: "jsonb!", warnings: "jsonb!", confidence: "text!", ops: "jsonb!", inverse: "jsonb",
      status: "text!", decisionReason: "text", decidedAt: "timestamptz", origin: "text!",
      requiresApproval: "bool!", expiresAt: "timestamptz",
    },
  },
  /* ── Nutrición ── */
  {
    name: "food_sources", sync: true, comment: "Fuentes de datos nutricionales (licencia, versión)",
    columns: { name: "text!", license: "text!", url: "text", version: "text", attribution: "text" },
  },
  {
    name: "foods", sync: true, comment: "Alimentos propios o importados (los semilla están en código)",
    indexes: ["barcode", "name"],
    columns: {
      name: "text!", brand: "text", barcode: "text", state: "text!", per100: "jsonb!", carbBasis: "text!",
      sourceId: "text!", sourceRef: "text", sourceVersion: "text", retrievedAt: "timestamptz", section: "text!",
      yieldFactor: "numeric", rawFoodId: "text", unitWeights: "jsonb", tags: "jsonb!", allergens: "jsonb!",
      notes: "text", source: "text!",
    },
  },
  {
    name: "recipes", sync: true, comment: "Recetas propias",
    columns: {
      name: "text!", slots: "jsonb!", servings: "numeric!", prepMin: "int!", cookMin: "int!", difficulty: "int!",
      steps: "jsonb!", tags: "jsonb!", batchFriendly: "bool!", costLevel: "int", source: "text!",
    },
  },
  {
    name: "recipe_ingredients", sync: true, comment: "Ingredientes de recetas propias", indexes: ["recipeId"],
    columns: { recipeId: "text!>recipes", foodId: "text!", grams: "numeric!", note: "text", sortOrder: "int!" },
  },
  {
    name: "recipe_prefs", sync: true, comment: "Favoritas, lista negra, último uso", indexes: ["recipeId"],
    columns: { frequency: "text", recipeId: "text!", favorite: "bool!", blacklisted: "bool!", lastUsed: "date" },
  },
  {
    name: "meal_plans", sync: true, comment: "Menús semanales", indexes: ["weekStart"],
    columns: { weekStart: "date!", generatedAt: "timestamptz!", settings: "jsonb!", generatorVersion: "text!" },
  },
  {
    name: "meal_entries", sync: true, comment: "Comidas previstas", indexes: ["mealPlanId", "date"],
    columns: {
      mealPlanId: "text!>meal_plans", date: "date!", slot: "text!", recipeId: "text!", servings: "numeric!",
      locked: "bool!", status: "text!", replacedFrom: "text", notes: "text",
    },
  },
  {
    name: "food_logs", sync: true, comment: "Comidas realizadas (con instantánea nutricional)", indexes: ["date"],
    columns: {
      favorite: "bool", stockUsage: "jsonb", date: "date!", eatenAt: "timestamptz!", slot: "text!", mealEntryId: "text", recipeId: "text",
      servings: "numeric", items: "jsonb!", title: "text!", totals: "jsonb!", source: "text!", note: "text",
    },
  },
  {
    name: "shopping_lists", sync: true, comment: "Lista de la compra", indexes: ["weekStart"],
    columns: {
      weekStart: "date!", mealPlanId: "text", items: "jsonb!", generatedAt: "timestamptz!", extra: "jsonb!",
    },
  },
  {
    name: "pantry_items", sync: true, comment: "Despensa", indexes: ["foodId"],
    columns: { foodId: "text!", name: "text!", grams: "numeric!", location: "text", quantityKnown: "bool", opened: "bool", useBy: "date", recipeId: "text", portions: "numeric" },
  },
  /* ── Diabetes ── */
  {
    name: "cgm_imports", sync: true, comment: "Importaciones CGM (procedencia y calidad)", indexes: ["fileHash"],
    columns: {
      fileName: "text!", fileSize: "int!", fileHash: "text!", format: "text!", parserVersion: "text!",
      importedAt: "timestamptz!", periodStart: "timestamptz", periodEnd: "timestamptz", readingsCount: "int!",
      duplicatesSkipped: "int!", rowsRejected: "int!", unit: "text!", timezone: "text!", warnings: "jsonb!",
      rawStored: "bool!", reportSummary: "jsonb",
    },
  },
  {
    name: "cgm_readings", sync: true, comment: "Lecturas CGM deduplicadas (mg/dL + original)",
    indexes: ["ts", "importId", "&dedupeKey", "kind"],
    uniques: [["dedupeKey"]],
    columns: {
      importId: "text!>cgm_imports", ts: "timestamptz!", localTime: "text!", valueMgdl: "numeric!",
      originalValue: "numeric!", originalUnit: "text!", kind: "text!", dedupeKey: "text!", ambiguousTime: "bool",
    },
  },
  {
    name: "glucose_events", sync: true, comment: "Eventos anotados (insulina solo como dato histórico)",
    indexes: ["ts", "kind", "dedupeKey"],
    columns: {
      ts: "timestamptz!", kind: "text!", value: "numeric", unit: "text", insulinType: "text", note: "text",
      source: "text!", importId: "text", dedupeKey: "text",
    },
  },
  {
    name: "cgm_metric_periods", sync: true, comment: "Instantáneas de métricas CGM", indexes: ["periodStart"],
    columns: { periodStart: "timestamptz!", periodEnd: "timestamptz!", label: "text!", metrics: "jsonb!", computedAt: "timestamptz!", version: "text!" },
  },
  {
    name: "raw_files", sync: false, comment: "Archivos originales cifrados (solo local)", indexes: ["importId"],
    columns: { importId: "text!", fileName: "text!", mime: "text!", iv: "text!", data: "jsonb!" },
  },
  /* ── Integraciones ── */
  {
    name: "integration_connections", sync: true, comment: "Estado de conectores (sin tokens)", indexes: ["provider"],
    columns: {
      provider: "text!", status: "text!", connectedAt: "timestamptz", lastSyncAt: "timestamptz", lastError: "text",
      scopes: "jsonb!", notes: "text",
    },
  },
  {
    name: "import_jobs", sync: true, comment: "Trazabilidad de importaciones", indexes: ["importedAt"],
    columns: { kind: "text!", fileName: "text", status: "text!", created: "int!", skipped: "int!", errors: "jsonb!", importedAt: "timestamptz!" },
  },
  {
    name: "sync_jobs", sync: false, comment: "Historial de sincronizaciones (solo local)", indexes: ["startedAt"],
    columns: { startedAt: "timestamptz!", finishedAt: "timestamptz", pushed: "int!", pulled: "int!", error: "text" },
  },
  /* ── IA, revisión y auditoría ── */
  {
    name: "ai_conversations", sync: true, comment: "Conversaciones con el asistente",
    columns: { title: "text!", provider: "text!", model: "text!", items: "jsonb!" },
  },
  {
    name: "ai_usage", sync: true, comment: "Uso de IA (tokens, coste estimado)", indexes: ["ts"],
    columns: {
      ts: "timestamptz!", provider: "text!", model: "text!", inputTokens: "int!", outputTokens: "int!",
      cacheReadTokens: "int!", conversationId: "text", costUsd: "numeric",
    },
  },
  {
    name: "user_feedback", sync: true, comment: "Valoraciones de propuestas/respuestas",
    columns: { targetType: "text!", targetId: "text!", rating: "int!", comment: "text" },
  },
  {
    name: "audit_events", sync: true, comment: "Auditoría sin contenido sensible", indexes: ["ts", "action"],
    columns: { ts: "timestamptz!", action: "text!", detail: "jsonb!" },
  },
  {
    name: "weekly_reviews", sync: true, comment: "Revisión semanal calculada", indexes: ["weekStart"],
    columns: {
      weekStart: "date!", generatedAt: "timestamptz!", version: "text!", data: "jsonb!", achievements: "jsonb!",
      opportunities: "jsonb!", notes: "text",
    },
  },
  {
    name: "experiments", sync: true, comment: "Experimentos de hábitos (no clínicos)", indexes: ["weekStart", "status"],
    columns: {
      weekStart: "date!", title: "text!", description: "text!", status: "text!", reason: "text", result: "text",
    },
  },
];

/** Tablas solo de servidor (no existen en IndexedDB). */
export const SERVER_ONLY_SQL = `
-- Credenciales OAuth cifradas (AES-256-GCM con TOKEN_ENCRYPTION_KEY). Sin políticas para clientes:
-- solo accesible con service role desde route handlers.
create table if not exists public.oauth_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  ciphertext text not null,
  iv text not null,
  external_user_id text,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.oauth_credentials enable row level security;
`;

export function parseColumn(spec: string): { type: ColType; notNull: boolean; ref?: TableName } {
  const m = /^(text|int|numeric|bool|date|timestamptz|jsonb)(!)?(?:>([a-z_]+))?$/.exec(spec);
  if (!m) throw new Error(`Columna inválida: ${spec}`);
  return { type: m[1] as ColType, notNull: !!m[2], ref: m[3] as TableName | undefined };
}

export const tableDef = (name: TableName): TableDef => {
  const t = TABLES.find((x) => x.name === name);
  if (!t) throw new Error(`Tabla desconocida: ${name}`);
  return t;
};

export const SYNC_TABLES = TABLES.filter((t) => t.sync && !t.serverOnly);

/** camelCase → snake_case */
export const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** snake_case → camelCase */
export const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export const BASE_COLUMNS: Record<string, string> = {
  createdAt: "timestamptz!",
  updatedAt: "timestamptz!",
  deletedAt: "timestamptz",
};

/** Columnas sincronizables de una tabla (camelCase), incluidas las base. */
export function syncColumns(name: TableName): string[] {
  return ["id", ...Object.keys(BASE_COLUMNS), ...Object.keys(tableDef(name).columns)];
}

/** Orden topológico de tablas según FKs (padres primero) para el push. */
export function dependencyOrder(): TableName[] {
  const order: TableName[] = [];
  const visit = (t: TableDef, stack: Set<string>) => {
    if (order.includes(t.name)) return;
    if (stack.has(t.name)) throw new Error(`Ciclo de FKs en ${t.name}`);
    stack.add(t.name);
    for (const spec of Object.values(t.columns)) {
      const { ref } = parseColumn(spec);
      if (ref && ref !== t.name) visit(tableDef(ref), stack);
    }
    stack.delete(t.name);
    order.push(t.name);
  };
  TABLES.forEach((t) => visit(t, new Set()));
  return order;
}
