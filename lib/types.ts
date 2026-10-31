export type MuscleId =
  | "traps" | "deltF" | "deltR" | "chest" | "biceps" | "triceps" | "forearm"
  | "abs" | "obliques" | "adductors" | "quads" | "calves"
  | "midback" | "lats" | "lowback" | "glutes" | "hams";

export type ExerciseId =
  | "bench" | "incline" | "fly" | "shoulder" | "pushdown" | "overheadtri"
  | "pulldown" | "row" | "chestrow" | "reversefly" | "curl" | "hammer"
  | "legpress" | "rdl" | "legcurl" | "legext" | "calf" | "deadbug";

export type Shape =
  | { t: "path"; d: string }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { t: "rect"; x: number; y: number; width: number; height: number; rx: number };

export interface ExerciseInfo {
  id: ExerciseId;
  name: string;
  group: string;
  /** Descanso por defecto, en segundos */
  rest: number;
  main: string;
  /** "—" si no hay músculos secundarios */
  sec: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  cues: string[];
}

export interface PlanItem {
  id: ExerciseId;
  sets: number;
  reps: string;
  rest: number;
}

export interface PlanDay {
  title: string;
  subtitle: string;
  time: string;
  items: PlanItem[];
}

export type PlanMode = 2 | 3;

/* ---- Persistencia (mismas claves y formas que el HTML original) ---- */

/** gymUI */
export interface UIState {
  mode: PlanMode;
  day: number;
  adapt: boolean;
}

/** gymSets: clave `${mode}-${day}-${exerciseId}` -> series marcadas */
export type SetsState = Record<string, boolean[]>;

/** gymLoads: clave `${mode}-${day}-${exerciseId}` -> último peso/reps escritos */
export type LoadsState = Record<string, { weight?: string; reps?: string }>;

/** gymLogs: sesiones guardadas */
export interface LogEntry {
  date: string;
  ts: number;
  title: string;
  count: number;
  vol: number;
}
