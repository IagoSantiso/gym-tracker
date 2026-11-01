/**
 * Tipos de los registros persistidos. Deben corresponderse con `schema.ts`
 * (columnas en camelCase; en Postgres se convierten a snake_case).
 */

export type Source =
  | "manual" // introducido por el usuario
  | "measured" // medido por un dispositivo/sensor
  | "imported" // importado de un archivo
  | "calculated" // calculado de forma determinista
  | "estimated" // estimación con margen de error
  | "ai_draft" // borrador generado por IA
  | "rules" // generado por el motor de reglas
  | "seed" // dato semilla de la app
  | "polar"; // sincronizado desde Polar AccessLink

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/* ───────────────────────── Perfil ───────────────────────── */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = lunes
export type EquipmentId =
  | "machine" | "barbell" | "dumbbell" | "cable" | "band" | "bodyweight"
  | "kettlebell" | "bench" | "smith" | "pullup_bar" | "treadmill" | "bike" | "other";

export interface Profile extends BaseRecord {
  displayName: string;
  appName: string;
  birthDate?: string | null;
  /** Solo si el usuario quiere usar ecuaciones que lo requieren */
  sex?: "female" | "male" | null;
  heightCm?: number | null;
  timezone: string;
  locale: string;
  experience?: "none" | "beginner" | "intermediate" | "advanced" | null;
  injuries?: string | null;
  equipment: EquipmentId[];
  /** minutos disponibles por día de la semana (0 = lunes) */
  availability: Record<Weekday, number>;
  /** referencia reciente de carrera, p. ej. 5 km en 27:30 */
  runRef?: { distanceKm: number; timeSec: number; date?: string } | null;
  hr?: { max?: number | null; rest?: number | null; lthr?: number | null } | null;
  bike?: { perWeek?: number; typicalMin?: number; hasPowerMeter?: boolean } | null;
  stepsGoal?: number | null;
  watch?: string | null;
  onboardingCompletedAt?: string | null;
  /** true mientras los datos precargados no hayan sido confirmados */
  draft?: boolean;
}

export type GoalPrimary = "fat_loss" | "recomposition" | "maintenance" | "performance";

export interface Goals extends BaseRecord {
  primaryGoal: GoalPrimary;
  /** % de peso corporal por semana (0–1, limitado en UI) */
  weightLossRatePct: number;
  targetWeightKg?: number | null;
  strengthPriority: "low" | "medium" | "high";
  endurancePriority: "low" | "medium" | "high";
  raceGoal?: { distanceKm: number; date?: string | null; targetTimeSec?: number | null } | null;
  calorieMode: "estimated" | "manual";
  manualKcal?: number | null;
  manualProteinG?: number | null;
  manualCarbsG?: number | null;
  manualFatG?: number | null;
  manualSource?: string | null;
  notes?: string | null;
}

export interface Preferences extends BaseRecord {
  theme: "system" | "light" | "dark";
  mealsPerDay: number;
  allergies: string[];
  intolerances: string[];
  excludedFoods: string[];
  cookingTimeMin: number;
  budget: "low" | "medium" | "high";
  autoApplyProgression: boolean;
  adaptationMode: boolean;
  deloadEveryWeeks?: number | null;
  deloadActiveWeek?: string | null;
  activeBreakReminderMin?: number | null;
  strengthDaysPerWeek: 2 | 3;
  activeTemplateId?: string | null;
}

export type ConsentKind =
  | "ai_assistant" | "ai_training" | "ai_nutrition" | "ai_cgm" | "ai_notes" | "cloud_sync" | "polar";

export interface Consent extends BaseRecord {
  kind: ConsentKind;
  granted: boolean;
  grantedAt?: string | null;
  revokedAt?: string | null;
  version: number;
}

export type GlucoseUnit = "mg/dL" | "mmol/L";

export interface DiabetesSettings extends BaseRecord {
  enabled: boolean;
  diabetesType: "type1" | "other" | "none";
  cgmDevice?: string | null;
  unit: GlucoseUnit;
  treatmentDescription?: string | null;
  /** rangos en mg/dL */
  targetLow: number;
  targetHigh: number;
  veryLow: number;
  veryHigh: number;
  targetsSource: "default_consensus" | "care_team";
  targetsSetAt?: string | null;
  hypoUnawareness?: string | null;
  protocolText?: string | null;
  protocolSource?: string | null;
  protocolUpdatedAt?: string | null;
  emergencyContacts?: string | null;
}

/* ───────────────────────── Cuerpo y hábitos ───────────────────────── */

export interface WeightEntry extends BaseRecord {
  date: string;
  measuredAt: string;
  weightKg: number;
  source: Source;
  note?: string | null;
}

export interface BodyMeasurement extends BaseRecord {
  date: string;
  kind: "waist" | "hip" | "chest" | "arm" | "thigh" | "body_fat_pct";
  value: number;
  unit: "cm" | "%";
  source: Source;
}

export interface RecoveryCheckIn extends BaseRecord {
  date: string;
  sleepHours?: number | null;
  sleepQuality?: number | null; // 1–5
  energy?: number | null; // 1–5
  fatigue?: number | null; // 1–5 (5 = muy fatigado)
  soreness?: number | null; // 1–5
  stress?: number | null; // 1–5
  hunger?: number | null; // 1–5
  pain?: string | null;
  notes?: string | null;
}

export interface HabitEntry extends BaseRecord {
  date: string;
  habit: string;
  done: boolean;
  experimentId?: string | null;
  note?: string | null;
}

export interface UserNote extends BaseRecord {
  ts: string;
  date: string;
  kind: "energy" | "hunger" | "stress" | "pain" | "fatigue" | "general";
  level?: number | null;
  body: string;
}

/* ───────────────────────── Entrenamiento ───────────────────────── */

export type MuscleId =
  | "traps" | "deltF" | "deltR" | "chest" | "biceps" | "triceps" | "forearm"
  | "abs" | "obliques" | "adductors" | "abductors" | "quads" | "calves"
  | "midback" | "lats" | "lowback" | "glutes" | "hams";

export interface CustomExercise extends BaseRecord {
  name: string;
  muscleGroup: string;
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  equipment: EquipmentId[];
  category: "compound" | "isolation";
  restSec: number;
  cues: string[];
  notes?: string | null;
  source: Source;
}

export interface TemplateItem {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** repeticiones en recámara objetivo */
  rir: number;
  restSec: number;
  tempo?: string | null;
  notes?: string | null;
  /** texto libre p. ej. "8–10 por lado" cuando no son reps simples */
  repsLabel?: string | null;
}

export interface TemplateDay {
  title: string;
  subtitle: string;
  focus: "push" | "pull" | "legs" | "upper" | "lower" | "full" | "custom";
  items: TemplateItem[];
}

export interface WorkoutTemplate extends BaseRecord {
  name: string;
  kind: "full_body" | "upper_lower" | "ppl" | "custom";
  days: TemplateDay[];
  source: Source;
  description?: string | null;
}

export interface WorkoutSession extends BaseRecord {
  date: string;
  startedAt: string;
  endedAt?: string | null;
  templateId?: string | null;
  dayIndex?: number | null;
  title: string;
  status: "in_progress" | "completed" | "cancelled";
  plannedItemId?: string | null;
  rpe?: number | null;
  durationMin?: number | null;
  deload: boolean;
  adaptation: boolean;
  notes?: string | null;
  source: Source;
}

export interface ExerciseSet extends BaseRecord {
  sessionId: string;
  exerciseId: string;
  exerciseOrder: number;
  setIndex: number;
  weightKg?: number | null;
  reps?: number | null;
  rir?: number | null;
  completed: boolean;
  completedAt?: string | null;
  isWarmup: boolean;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  notes?: string | null;
}

export type Sport = "run" | "bike" | "walk" | "treadmill" | "mobility" | "swim" | "other";
export type EnduranceType =
  | "recovery" | "easy" | "long" | "tempo" | "intervals" | "hills" | "technique" | "race" | "endurance" | "commute" | "other";

export interface EnduranceSession extends BaseRecord {
  sport: Sport;
  date: string;
  startedAt: string;
  durationSec: number;
  distanceM?: number | null;
  elevationGainM?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  rpe?: number | null;
  avgPowerW?: number | null;
  indoor?: boolean | null;
  treadmillSpeedKmh?: number | null;
  treadmillInclinePct?: number | null;
  steps?: number | null;
  sessionType?: EnduranceType | null;
  whileWorking?: boolean | null;
  shoeId?: string | null;
  plannedItemId?: string | null;
  title?: string | null;
  notes?: string | null;
  hrZonesSec?: number[] | null;
  source: Source;
  externalId?: string | null;
  importId?: string | null;
}

export interface Shoe extends BaseRecord {
  name: string;
  startKm: number;
  retired: boolean;
  notes?: string | null;
}

export interface ActivityStream extends BaseRecord {
  sessionId: string;
  points: { t: number; hr?: number; d?: number; alt?: number; lat?: number; lon?: number; w?: number }[];
}

export interface DailyActivity extends BaseRecord {
  date: string;
  steps?: number | null;
  activeMin?: number | null;
  source: Source;
  externalId?: string | null;
}

export interface SleepRecord extends BaseRecord {
  date: string;
  durationMin: number;
  quality?: number | null;
  source: Source;
  externalId?: string | null;
}

/* ───────────────────────── Planificación ───────────────────────── */

export type Intensity = "rest" | "easy" | "moderate" | "hard";
export type PlannedKind = "strength" | "run" | "bike" | "walk" | "mobility" | "rest";

export interface RunSpec {
  type: EnduranceType;
  durationMin?: number;
  distanceKm?: number;
  /** ritmo orientativo en s/km (rango) */
  paceSecPerKm?: [number, number] | null;
  structure?: string | null;
  hrZone?: string | null;
}

export interface PlannedItemData {
  date: string;
  kind: PlannedKind;
  title: string;
  intensity: Intensity;
  durationMin: number;
  templateId?: string | null;
  dayIndex?: number | null;
  runSpec?: RunSpec | null;
  /** grupos de carga para reglas de interferencia */
  loadsLegs?: boolean;
  sortOrder: number;
  notes?: string | null;
}

export interface PlannedItem extends BaseRecord, PlannedItemData {
  weekStart: string;
  status: "planned" | "done" | "modified" | "cancelled" | "moved";
  locked: boolean;
  originalDate?: string | null;
  actualRef?: { table: "workout_sessions" | "endurance_sessions"; id: string } | null;
  source: Source;
}

export interface PlanWeek extends BaseRecord {
  weekStart: string;
  original: PlannedItemData[];
  generatorVersion: string;
  generatedAt: string;
  lockedDays: string[];
  notes?: string | null;
}

export type ProposalOp =
  | { op: "create"; table: string; record: Record<string, unknown> }
  | { op: "update"; table: string; id: string; changes: Record<string, unknown> }
  | { op: "delete"; table: string; id: string };

export interface Proposal extends BaseRecord {
  domain: "plan" | "training" | "nutrition" | "goals" | "habits";
  kind: string;
  title: string;
  summary: string;
  reasons: string[];
  dataUsed: string[];
  assumptions: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
  ops: ProposalOp[];
  inverse?: ProposalOp[] | null;
  status: "pending" | "accepted" | "rejected" | "reverted" | "expired";
  decisionReason?: string | null;
  decidedAt?: string | null;
  origin: "rules" | "ai";
  requiresApproval: boolean;
  expiresAt?: string | null;
}

/* ───────────────────────── Nutrición ───────────────────────── */

export interface NutrientsPer100 {
  kcal: number | null;
  proteinG: number | null;
  /** hidratos disponibles (sin fibra) */
  carbsAvailableG: number | null;
  /** hidratos totales (con fibra, criterio USDA) */
  carbsTotalG: number | null;
  fiberG: number | null;
  fatG: number | null;
  satFatG: number | null;
  sugarsG: number | null;
  saltG: number | null;
}

export type ShopSection =
  | "fruta_verdura" | "carne_pescado" | "lacteos_huevos" | "panaderia_cereales"
  | "legumbres_conservas" | "despensa" | "congelados" | "bebidas" | "otros";

export interface Food extends BaseRecord {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  state: "raw" | "cooked" | "as_sold";
  per100: NutrientsPer100;
  /** criterio de "hidratos" de la fuente original */
  carbBasis: "available" | "total";
  sourceId: string;
  sourceRef?: string | null;
  sourceVersion?: string | null;
  retrievedAt?: string | null;
  section: ShopSection;
  /** gramos cocinados por gramo crudo (p. ej. arroz 2,6) */
  yieldFactor?: number | null;
  rawFoodId?: string | null;
  unitWeights?: Record<string, number> | null;
  tags: string[];
  allergens: string[];
  notes?: string | null;
  source: Source;
}

export interface FoodSource extends BaseRecord {
  name: string;
  license: string;
  url?: string | null;
  version?: string | null;
  attribution?: string | null;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post";

export interface RecipeIngredientData {
  foodId: string;
  grams: number;
  note?: string | null;
}

export interface Recipe extends BaseRecord {
  name: string;
  slots: MealSlot[];
  servings: number;
  prepMin: number;
  cookMin: number;
  difficulty: 1 | 2 | 3;
  steps: string[];
  tags: string[];
  batchFriendly: boolean;
  costLevel?: 1 | 2 | 3 | null;
  source: Source;
}

export interface RecipeIngredient extends BaseRecord, RecipeIngredientData {
  recipeId: string;
  sortOrder: number;
}

export interface RecipePref extends BaseRecord {
  recipeId: string;
  favorite: boolean;
  blacklisted: boolean;
  lastUsed?: string | null;
}

export interface MealPlan extends BaseRecord {
  weekStart: string;
  generatedAt: string;
  settings: Record<string, unknown>;
  generatorVersion: string;
}

export interface MealEntry extends BaseRecord {
  mealPlanId: string;
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
  locked: boolean;
  status: "planned" | "eaten" | "skipped" | "replaced";
  replacedFrom?: string | null;
  notes?: string | null;
}

export interface NutrientTotals {
  kcal: number;
  proteinG: number;
  carbsAvailableG: number;
  fiberG: number;
  fatG: number;
  satFatG: number;
  sugarsG: number;
  saltG: number;
  /** nutrientes con datos ausentes en algún ingrediente */
  missing: string[];
}

export interface FoodLog extends BaseRecord {
  date: string;
  eatenAt: string;
  slot: MealSlot;
  mealEntryId?: string | null;
  recipeId?: string | null;
  servings?: number | null;
  items: { foodId: string; grams: number }[];
  title: string;
  totals: NutrientTotals;
  source: Source;
  note?: string | null;
}

export interface ShoppingItem {
  key: string;
  foodId: string;
  name: string;
  section: ShopSection;
  grams: number;
  pantryGrams: number;
  checked: boolean;
}

export interface ShoppingList extends BaseRecord {
  weekStart: string;
  mealPlanId?: string | null;
  items: ShoppingItem[];
  generatedAt: string;
  extra: { name: string; checked: boolean }[];
}

export interface PantryItem extends BaseRecord {
  foodId: string;
  name: string;
  grams: number;
}

/* ───────────────────────── Diabetes ───────────────────────── */

export interface CgmImport extends BaseRecord {
  fileName: string;
  fileSize: number;
  fileHash: string;
  format: "libreview_csv" | "generic_csv" | "agp_pdf";
  parserVersion: string;
  importedAt: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  readingsCount: number;
  duplicatesSkipped: number;
  rowsRejected: number;
  unit: GlucoseUnit;
  timezone: string;
  warnings: string[];
  rawStored: boolean;
  /** métricas agregadas leídas de un PDF (sin lecturas individuales) */
  reportSummary?: Record<string, number | string> | null;
}

export interface CgmReading extends BaseRecord {
  importId: string;
  ts: string;
  localTime: string;
  valueMgdl: number;
  originalValue: number;
  originalUnit: GlucoseUnit;
  kind: "historic" | "scan" | "strip";
  dedupeKey: string;
  ambiguousTime?: boolean;
}

export type GlucoseEventKind =
  | "meal" | "exercise" | "sleep" | "illness" | "stress" | "alcohol" | "medication"
  | "insulin" | "fingerstick" | "hypo_treatment" | "note" | "other";

export interface GlucoseEvent extends BaseRecord {
  ts: string;
  kind: GlucoseEventKind;
  value?: number | null;
  unit?: string | null;
  insulinType?: "rapid" | "long" | "other" | null;
  note?: string | null;
  source: Source;
  importId?: string | null;
  dedupeKey?: string | null;
}

export interface CgmMetricPeriod extends BaseRecord {
  periodStart: string;
  periodEnd: string;
  label: string;
  metrics: Record<string, number | null>;
  computedAt: string;
  version: string;
}

export interface RawFile extends BaseRecord {
  importId: string;
  fileName: string;
  mime: string;
  iv: string;
  data: ArrayBuffer;
}

/* ───────────────────────── Integraciones ───────────────────────── */

export interface IntegrationConnection extends BaseRecord {
  provider: "polar" | "libreview_manual" | "health_connect" | "tcx_gpx" | "open_food_facts";
  status: "connected" | "disconnected" | "error" | "not_available" | "manual";
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  scopes: string[];
  notes?: string | null;
}

export interface ImportJob extends BaseRecord {
  kind: "cgm_csv" | "cgm_pdf" | "tcx" | "gpx" | "steps_csv" | "sleep_csv" | "legacy_v2" | "polar" | "backup_json";
  fileName?: string | null;
  status: "ok" | "partial" | "error";
  created: number;
  skipped: number;
  errors: string[];
  importedAt: string;
}

export interface SyncJob extends BaseRecord {
  startedAt: string;
  finishedAt?: string | null;
  pushed: number;
  pulled: number;
  error?: string | null;
}

/* ───────────────────────── IA, revisión, auditoría ───────────────────────── */

export interface AiConversation extends BaseRecord {
  title: string;
  provider: string;
  model: string;
  /** transcript neutral; los bloques crudos del proveedor se guardan opacos */
  items: unknown[];
}

export interface AiUsage extends BaseRecord {
  ts: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  conversationId?: string | null;
  costUsd?: number | null;
}

export interface UserFeedback extends BaseRecord {
  targetType: string;
  targetId: string;
  rating: -1 | 0 | 1;
  comment?: string | null;
}

export interface AuditEvent extends BaseRecord {
  ts: string;
  action: string;
  detail: Record<string, string | number | boolean | null>;
}

export interface WeeklyReview extends BaseRecord {
  weekStart: string;
  generatedAt: string;
  version: string;
  data: Record<string, unknown>;
  achievements: string[];
  opportunities: string[];
  notes?: string | null;
}

export interface Experiment extends BaseRecord {
  weekStart: string;
  title: string;
  description: string;
  status: "proposed" | "accepted" | "rejected" | "done";
  reason?: string | null;
  result?: string | null;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface OutboxEntry {
  seq?: number;
  table: string;
  id: string;
  at: string;
}

/* Mapa tabla → tipo de registro */
export interface TableMap {
  profiles: Profile;
  goals: Goals;
  preferences: Preferences;
  consents: Consent;
  diabetes_settings: DiabetesSettings;
  weight_entries: WeightEntry;
  body_measurements: BodyMeasurement;
  recovery_checkins: RecoveryCheckIn;
  habit_entries: HabitEntry;
  user_notes: UserNote;
  exercises: CustomExercise;
  workout_templates: WorkoutTemplate;
  workout_sessions: WorkoutSession;
  exercise_sets: ExerciseSet;
  endurance_sessions: EnduranceSession;
  shoes: Shoe;
  activity_streams: ActivityStream;
  daily_activity: DailyActivity;
  sleep_records: SleepRecord;
  plan_weeks: PlanWeek;
  planned_items: PlannedItem;
  proposals: Proposal;
  food_sources: FoodSource;
  foods: Food;
  recipes: Recipe;
  recipe_ingredients: RecipeIngredient;
  recipe_prefs: RecipePref;
  meal_plans: MealPlan;
  meal_entries: MealEntry;
  food_logs: FoodLog;
  shopping_lists: ShoppingList;
  pantry_items: PantryItem;
  cgm_imports: CgmImport;
  cgm_readings: CgmReading;
  glucose_events: GlucoseEvent;
  cgm_metric_periods: CgmMetricPeriod;
  raw_files: RawFile;
  integration_connections: IntegrationConnection;
  import_jobs: ImportJob;
  sync_jobs: SyncJob;
  ai_conversations: AiConversation;
  ai_usage: AiUsage;
  user_feedback: UserFeedback;
  audit_events: AuditEvent;
  weekly_reviews: WeeklyReview;
  experiments: Experiment;
}

export type TableName = keyof TableMap;
export type Rec<T extends TableName> = TableMap[T];
