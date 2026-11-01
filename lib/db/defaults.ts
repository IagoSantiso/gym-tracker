/**
 * Valores iniciales. El perfil se precarga como BORRADOR con lo que el usuario contó
 * (T1D, Libre 2 Plus, MDI, corre, bici, gimnasio, Polar, Europe/Madrid) y debe confirmarlo.
 * Nunca se precargan peso, altura, edad, dosis, glucemia objetivo, calorías ni macros.
 */
import type { Consent, ConsentKind, DiabetesSettings, Goals, Preferences, Profile } from "./types";
import { DEFAULT_TZ } from "@/lib/domain/time";

type NoBase<T> = Omit<T, "createdAt" | "updatedAt">;

export const DEFAULT_PROFILE: NoBase<Profile> = {
  id: "me",
  displayName: "",
  appName: "NEXO",
  birthDate: null,
  sex: null,
  heightCm: null,
  timezone: DEFAULT_TZ,
  locale: "es-ES",
  experience: "beginner",
  injuries: null,
  equipment: ["machine", "dumbbell", "cable", "barbell", "bench", "bodyweight", "treadmill", "bike"],
  availability: { 0: 60, 1: 45, 2: 60, 3: 45, 4: 60, 5: 90, 6: 90 },
  runRef: null,
  hr: null,
  bike: { perWeek: 1, typicalMin: 60, hasPowerMeter: false },
  stepsGoal: 8000,
  watch: "Polar (modelo por confirmar)",
  onboardingCompletedAt: null,
  draft: true,
};

export const DEFAULT_GOALS: NoBase<Goals> = {
  id: "me",
  primaryGoal: "fat_loss",
  weightLossRatePct: 0.5,
  targetWeightKg: null,
  strengthPriority: "medium",
  endurancePriority: "medium",
  raceGoal: null,
  calorieMode: "estimated",
  manualKcal: null,
  manualProteinG: null,
  manualCarbsG: null,
  manualFatG: null,
  manualSource: null,
  notes: null,
};

export const DEFAULT_PREFERENCES: NoBase<Preferences> = {
  id: "me",
  theme: "system",
  mealsPerDay: 4,
  allergies: [],
  intolerances: [],
  excludedFoods: [],
  cookingTimeMin: 30,
  budget: "medium",
  autoApplyProgression: false,
  adaptationMode: false,
  deloadEveryWeeks: null,
  deloadActiveWeek: null,
  activeBreakReminderMin: null,
  strengthDaysPerWeek: 3,
  activeTemplateId: "ppl-3d",
};

/**
 * Rangos por defecto = Consenso Internacional TIR (Battelino 2019). Se etiquetan como
 * "por defecto" hasta que el usuario introduzca los de su equipo sanitario.
 */
export const DEFAULT_DIABETES: NoBase<DiabetesSettings> = {
  id: "me",
  enabled: true,
  diabetesType: "type1",
  cgmDevice: "FreeStyle Libre 2 Plus",
  unit: "mg/dL",
  treatmentDescription: "Múltiples dosis de insulina (MDI) — sin dosis ni ratios en la app",
  targetLow: 70,
  targetHigh: 180,
  veryLow: 54,
  veryHigh: 250,
  targetsSource: "default_consensus",
  targetsSetAt: null,
  hypoUnawareness: null,
  protocolText: null,
  protocolSource: null,
  protocolUpdatedAt: null,
  emergencyContacts: null,
};

export const CONSENT_KINDS: { kind: ConsentKind; label: string; detail: string }[] = [
  { kind: "ai_assistant", label: "Asistente IA", detail: "Permite enviar preguntas al proveedor de IA configurado (Claude por defecto) a través del servidor." },
  { kind: "ai_training", label: "IA: entrenamiento", detail: "Resúmenes de sesiones, cargas y plan semanal." },
  { kind: "ai_nutrition", label: "IA: nutrición", detail: "Menú, comidas registradas y preferencias (alergias incluidas)." },
  { kind: "ai_cgm", label: "IA: glucosa (agregada)", detail: "Solo métricas agregadas del periodo (TIR, media, CV…), nunca lecturas individuales." },
  { kind: "ai_notes", label: "IA: notas y recuperación", detail: "Check-ins de sueño, energía, dolor y notas." },
  { kind: "cloud_sync", label: "Sincronización en la nube", detail: "Copia cifrada en tránsito en tu proyecto de Supabase (RLS por usuario)." },
  { kind: "polar", label: "Polar AccessLink", detail: "Importar entrenamientos de Polar Flow (lectura)." },
];

export const CONSENT_VERSION = 1;

export const defaultConsent = (kind: ConsentKind): NoBase<Consent> => ({
  id: kind, kind, granted: false, grantedAt: null, revokedAt: null, version: CONSENT_VERSION,
});
