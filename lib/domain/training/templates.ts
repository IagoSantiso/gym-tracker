/** Rutinas semilla: las dos originales del Gym Tracker + full body. */
import type { TemplateDay, TemplateItem, WorkoutTemplate } from "@/lib/db/types";
import { PLANS } from "./original";
import { LIBRARY_BY_ID } from "./library";

export function parseReps(label: string): { repsMin: number; repsMax: number; repsLabel: string | null } {
  const m = /^(\d+)\s*[–-]\s*(\d+)(.*)$/.exec(label.trim());
  if (m) return { repsMin: +m[1], repsMax: +m[2], repsLabel: m[3].trim() ? label : null };
  const n = /^(\d+)/.exec(label);
  return n ? { repsMin: +n[1], repsMax: +n[1], repsLabel: null } : { repsMin: 8, repsMax: 12, repsLabel: label };
}

const item = (exerciseId: string, sets: number, reps: string, restSec?: number, rir = 2): TemplateItem => ({
  exerciseId, sets, ...parseReps(reps), rir, restSec: restSec ?? LIBRARY_BY_ID[exerciseId]?.restSec ?? 90,
});

const FOCUS: Record<string, TemplateDay["focus"]> = {
  Empuje: "push", Tracción: "pull", "Piernas + core": "legs", "Tren superior": "upper", "Tren inferior + core": "lower",
};

const fromOriginal = (mode: 2 | 3): TemplateDay[] =>
  PLANS[mode].map((d) => ({
    title: d.title,
    subtitle: d.subtitle,
    focus: FOCUS[d.title] ?? "custom",
    items: d.items.map((i) => item(i.id, i.sets, i.reps, i.rest)),
  }));

type Seed = Omit<WorkoutTemplate, "createdAt" | "updatedAt">;

export const SEED_TEMPLATES: Seed[] = [
  {
    id: "ppl-3d", name: "Empuje / Tracción / Piernas · 3 días", kind: "ppl", source: "seed",
    description: "Plan original: cada grupo muscular una vez por semana, ~60 min por sesión.",
    days: fromOriginal(3),
  },
  {
    id: "ul-2d", name: "Torso / Pierna · 2 días", kind: "upper_lower", source: "seed",
    description: "Plan original de 2 días.",
    days: fromOriginal(2),
  },
  {
    id: "fb-3d", name: "Full body · 3 días", kind: "full_body", source: "seed",
    description: "Cuerpo completo con variantes A/B/C; útil si también corres o pedaleas (menos volumen por sesión).",
    days: [
      { title: "Full body A", subtitle: "Sentadilla · empuje horizontal · tracción vertical", focus: "full",
        items: [item("goblet", 3, "8–12"), item("dbbench", 3, "8–12"), item("pulldown", 3, "8–12"), item("rdl", 2, "8–10"), item("facepull", 2, "12–15"), item("plank", 2, "30–45", 45)] },
      { title: "Full body B", subtitle: "Bisagra · empuje vertical · tracción horizontal", focus: "full",
        items: [item("hipthrust", 3, "8–12"), item("machinepress", 3, "8–12"), item("row", 3, "8–12"), item("splitsquat", 2, "8–10"), item("curl", 2, "10–12"), item("pallof", 2, "10–12")] },
      { title: "Full body C", subtitle: "Prensa · inclinado · remo con apoyo", focus: "full",
        items: [item("legpress", 3, "10–12"), item("incline", 3, "8–12"), item("chestrow", 3, "10–12"), item("legcurl", 2, "10–15"), item("pushdown", 2, "10–15"), item("deadbug", 2, "8–10 por lado")] },
    ],
  },
];
