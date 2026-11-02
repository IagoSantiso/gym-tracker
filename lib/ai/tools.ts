/**
 * Herramientas del asistente: definiciones y esquemas ESTRICTOS compartidos por servidor y cliente.
 * - Lectura: devuelven resúmenes mínimos desde IndexedDB (se ejecutan en el cliente).
 * - Escritura: NUNCA aplican cambios; crean propuestas pendientes de aprobación.
 * Ningún esquema contiene campos de insulina, dosis, ratios ni umbrales clínicos.
 */
import { z } from "zod";
import type { ConsentKind } from "@/lib/db/types";

export const Meta = z.strictObject({
  assumptions: z.array(z.string().max(300)).max(8),
  data_used: z.array(z.string().max(200)).max(10),
  warnings: z.array(z.string().max(300)).max(6),
  confidence: z.enum(["low", "medium", "high"]),
  requires_user_approval: z.literal(true),
  created_at: z.string().max(40),
});

const Days = z.strictObject({ days: z.number().int().min(7).max(90) });
const Empty = z.strictObject({});

export const ScheduleChange = z.strictObject({
  item_id: z.string().max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  intensity: z.enum(["easy", "moderate", "hard"]).nullable(),
  duration_min: z.number().int().min(10).max(240).nullable(),
  status: z.enum(["planned", "modified", "cancelled"]).nullable(),
  notes: z.string().max(300).nullable(),
});

export const ProposeSchedule = z.strictObject({
  title: z.string().max(120),
  summary: z.string().max(500),
  reasons: z.array(z.string().max(300)).min(1).max(6),
  changes: z.array(ScheduleChange).min(1).max(10),
  meta: Meta,
});

export const TrainingPlanDraft = z.strictObject({
  name: z.string().max(80),
  description: z.string().max(400),
  days: z.array(z.strictObject({
    title: z.string().max(60),
    subtitle: z.string().max(120),
    focus: z.enum(["push", "pull", "legs", "upper", "lower", "full", "custom"]),
    items: z.array(z.strictObject({
      exercise_id: z.string().max(40),
      sets: z.number().int().min(1).max(6),
      reps_min: z.number().int().min(1).max(30),
      reps_max: z.number().int().min(1).max(30),
      rir: z.number().int().min(0).max(5),
      rest_sec: z.number().int().min(30).max(300),
      notes: z.string().max(200).nullable(),
    })).min(1).max(10),
  })).min(1).max(6),
  meta: Meta,
});

export const MealPlanDraft = z.strictObject({
  title: z.string().max(120),
  summary: z.string().max(500),
  changes: z.array(z.strictObject({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack", "pre", "post"]),
    recipe_id: z.string().max(60),
    servings: z.number().min(0.5).max(2),
  })).min(1).max(21),
  meta: Meta,
});

export const RecipeDraft = z.strictObject({
  name: z.string().max(80),
  slots: z.array(z.enum(["breakfast", "lunch", "dinner", "snack", "pre", "post"])).min(1).max(3),
  servings: z.number().int().min(1).max(8),
  ingredients: z.array(z.strictObject({ food_id: z.string().max(60), grams: z.number().min(1).max(2000) })).min(1).max(15),
  steps: z.array(z.string().max(300)).min(1).max(10),
  prep_min: z.number().int().min(0).max(240),
  meta: Meta,
});

export const WeeklySummaryDraft = z.strictObject({
  achievements: z.array(z.string().max(200)).max(3),
  opportunities: z.array(z.string().max(200)).max(2),
  experiment: z.strictObject({ title: z.string().max(100), description: z.string().max(300) }),
  observations: z.array(z.string().max(300)).max(5),
  questions_for_care_team: z.array(z.string().max(250)).max(5),
  meta: Meta,
});

export const SaveNote = z.strictObject({
  kind: z.enum(["energy", "hunger", "stress", "pain", "fatigue", "general"]),
  text: z.string().max(1000),
});

export const Alternatives = z.strictObject({
  exercise_id: z.string().max(40),
  reason: z.enum(["busy", "pain", "no_equipment"]),
  available_equipment: z.array(z.string().max(20)).max(12).nullable(),
});

const Slot = z.enum(["breakfast", "lunch", "dinner", "snack", "pre", "post"]);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Estimación por alimento cuando no existe en la base (p. ej. «rosquillas» en un bar). */
const ItemEstimate = z.strictObject({
  kcal: z.number().min(0).max(2500),
  protein_g: z.number().min(0).max(200),
  carbs_available_g: z.number().min(0).max(400),
  fat_g: z.number().min(0).max(200),
  fiber_g: z.number().min(0).max(60).nullable(),
});

export const LogMealEstimate = z.strictObject({
  date: DateStr.nullable(),
  time_hhmm: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  slot: Slot,
  title: z.string().max(120),
  items: z.array(z.strictObject({
    description: z.string().max(120),
    food_id: z.string().max(60).nullable(),
    grams: z.number().min(1).max(2000),
    estimate: ItemEstimate.nullable(),
  })).min(1).max(12),
  replaces_planned_meal: z.boolean(),
  meta: Meta,
});

export const MealVariant = z.strictObject({
  date: DateStr,
  slot: Slot,
  name: z.string().max(80),
  reason: z.string().max(300),
  ingredients: z.array(z.strictObject({ food_id: z.string().max(60), grams: z.number().min(1).max(1500) })).min(1).max(15),
  meta: Meta,
});

export const CompensationChoice = z.strictObject({
  option: z.enum(["walk_incline", "easy_jog"]),
  reason: z.string().max(300),
});

export const DateOnly = z.strictObject({ date: DateStr.nullable() });

export const WeekOffset = z.strictObject({ week_offset: z.number().int().min(-4).max(2) });

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType;
  kind: "read" | "write" | "display";
  consent: ConsentKind;
}

export const TOOLS: ToolDef[] = [
  { name: "get_user_profile_summary", kind: "read", consent: "ai_assistant", schema: Empty, description: "Resumen del perfil: objetivos, preferencias, experiencia, disponibilidad semanal y material. Sin datos clínicos." },
  { name: "get_training_history", kind: "read", consent: "ai_training", schema: Days, description: "Sesiones de fuerza (por ejercicio: mejor peso, reps, e1RM estimado) y de resistencia de los últimos N días." },
  { name: "get_weekly_schedule", kind: "read", consent: "ai_training", schema: WeekOffset, description: "Plan semanal vigente (con ids de cada elemento, estado e intensidad), plan original y reglas que incumple. week_offset 0 = esta semana." },
  { name: "get_activity_summary", kind: "read", consent: "ai_training", schema: Days, description: "Minutos/km por deporte, pasos, carga interna aproximada (sRPE) y ratio agudo:crónico (descriptivo)." },
  { name: "get_exercise_alternatives", kind: "read", consent: "ai_training", schema: Alternatives, description: "Alternativas deterministas de la biblioteca a un ejercicio (mismos músculos, otro material o menor dificultad). Úsala antes de sugerir sustituciones." },
  { name: "get_food_inventory", kind: "read", consent: "ai_nutrition", schema: Empty, description: "Recetas disponibles (id, nombre, momentos, kcal e hidratos por ración), alimentos (id, nombre), despensa, alergias y exclusiones." },
  { name: "get_nutrition_summary", kind: "read", consent: "ai_nutrition", schema: Days, description: "Promedios diarios registrados (energía, proteína, hidratos disponibles, fibra), días con registros y menú de la semana." },
  { name: "get_cgm_period_summary", kind: "read", consent: "ai_cgm", schema: Days, description: "Métricas AGREGADAS de glucosa del periodo (TIR/TBR/TAR, media, CV, GMI si procede, cobertura, episodios) y observaciones descriptivas. Nunca lecturas individuales." },
  { name: "get_recovery_summary", kind: "read", consent: "ai_notes", schema: Days, description: "Check-ins de recuperación percibida (sueño, energía, fatiga, dolor) y notas del usuario." },
  { name: "get_day_balance", kind: "read", consent: "ai_nutrition", schema: DateOnly, description: "Balance nutricional de un día (date null = hoy): lo registrado, lo que queda del menú (con meal ids, recetas y gramos por ingrediente), rangos objetivo (energía, proteína, grasa, hidratos pautados si existen), estado y opciones deterministas para reajustar lo que queda. Úsala antes de proponer cambios del día." },
  { name: "log_meal_estimate", kind: "write", consent: "ai_nutrition", schema: LogMealEstimate, description: "Propone REGISTRAR lo que el usuario dice que ha comido (pendiente de su aprobación). Usa food_id de get_food_inventory cuando exista (la app calcula con su base de datos) y estimate solo para lo que no exista (p. ej. bollería de un bar): valores aproximados por la cantidad indicada, coherentes (kcal ≈ 4·prot + 4·hidratos + 9·grasa). replaces_planned_meal=true si sustituye a la comida prevista en ese hueco. Nunca incluyas insulina." },
  { name: "propose_meal_variant", kind: "write", consent: "ai_nutrition", schema: MealVariant, description: "Propone cambiar los INGREDIENTES de una comida prevista (fecha + hueco) por otros que el usuario tiene, con food_id existentes y gramos. La app calcula nutrientes y avisa si cambian los hidratos de esa comida. Pendiente de aprobación." },
  { name: "propose_compensation_activity", kind: "write", consent: "ai_training", schema: CompensationChoice, description: "Propone añadir HOY al plan la actividad suave de compensación calculada por la app (get_day_balance → compensation): walk_incline = caminar en cinta con inclinación, easy_jog = trote suave. Minutos e intensidad los fija la app (máx. 30 min, suave). Solo si compensation no es null y el usuario lo quiere. Pendiente de aprobación." },
  { name: "propose_schedule_changes", kind: "write", consent: "ai_training", schema: ProposeSchedule, description: "Crea una PROPUESTA (no aplica nada) de cambios al plan semanal usando ids de get_weekly_schedule. Respeta: no dos días duros seguidos, al menos un descanso, no recuperar sesiones acumulando volumen." },
  { name: "draft_training_plan", kind: "write", consent: "ai_training", schema: TrainingPlanDraft, description: "Crea un BORRADOR de rutina de fuerza con ejercicios de la biblioteca (exercise_id existentes). Queda pendiente de aprobación." },
  { name: "draft_meal_plan", kind: "write", consent: "ai_nutrition", schema: MealPlanDraft, description: "Propone sustituir comidas del menú (fecha + momento) por recetas existentes (recipe_id de get_food_inventory). Pendiente de aprobación." },
  { name: "draft_recipe", kind: "write", consent: "ai_nutrition", schema: RecipeDraft, description: "Propone una receta nueva con alimentos existentes (food_id) y gramos. La app calcula los nutrientes; tú no inventes valores." },
  { name: "draft_weekly_summary", kind: "display", consent: "ai_assistant", schema: WeeklySummaryDraft, description: "Muestra al usuario un resumen semanal estructurado: 3 logros, 2 oportunidades, 1 experimento de hábito NO clínico, observaciones descriptivas y preguntas para su equipo sanitario." },
  { name: "save_user_note", kind: "write", consent: "ai_notes", schema: SaveNote, description: "Propone guardar una nota del usuario (requiere su confirmación)." },
];

export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

export function jsonSchemaFor(t: ToolDef): Record<string, unknown> {
  const s = z.toJSONSchema(t.schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export function validateToolInput(name: string, input: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
  const t = TOOL_BY_NAME[name];
  if (!t) return { ok: false, error: `Herramienta desconocida: ${name}` };
  const r = t.schema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/* ───────── Transcript neutral cliente ↔ servidor ───────── */

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  invalid?: string | null;
  blocked?: boolean;
}

export type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; provider: string; raw: unknown; guardrail?: boolean }
  | { role: "tool"; results: { id: string; name: string; content: string; isError?: boolean; display?: unknown }[] };

export interface ChatRequest {
  items: ChatItem[];
  context: { today: string; timezone: string; consents: Partial<Record<ConsentKind, boolean>>; unit: string };
}

export interface ChatResponse {
  item?: Extract<ChatItem, { role: "assistant" }>;
  emergency?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number | null };
  provider?: string;
  model?: string;
}

/** Quita restricciones no admitidas por el modo estricto (se validan con Zod en servidor y cliente). */
export function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const DROP = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "minItems", "maxItems"]);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(schema) as Record<string, unknown>;
}
