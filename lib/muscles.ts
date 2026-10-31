import type { MuscleId, Shape } from "./types";

/** Formas SVG de cada músculo (viewBox de 100×200 por figura). */
export const MUSCLE_SHAPES: Record<"front" | "back", Partial<Record<MuscleId, Shape[]>>> = {
  front: {
    traps: [
      { t: "path", d: "M43 27 L50 30 L57 27 L62 33 L38 33 Z" },
    ],
    deltF: [
      { t: "ellipse", cx: 32, cy: 40, rx: 7, ry: 8 },
      { t: "ellipse", cx: 68, cy: 40, rx: 7, ry: 8 },
    ],
    chest: [
      { t: "path", d: "M49 35 Q37 33 34 42 Q36 53 49 52 Z" },
      { t: "path", d: "M51 35 Q63 33 66 42 Q64 53 51 52 Z" },
    ],
    biceps: [
      { t: "ellipse", cx: 28, cy: 58, rx: 5, ry: 10 },
      { t: "ellipse", cx: 72, cy: 58, rx: 5, ry: 10 },
    ],
    forearm: [
      { t: "ellipse", cx: 24, cy: 80, rx: 4.5, ry: 11 },
      { t: "ellipse", cx: 76, cy: 80, rx: 4.5, ry: 11 },
    ],
    abs: [
      { t: "rect", x: 43, y: 55, width: 14, height: 32, rx: 5 },
    ],
    obliques: [
      { t: "ellipse", cx: 38.5, cy: 71, rx: 3.6, ry: 12 },
      { t: "ellipse", cx: 61.5, cy: 71, rx: 3.6, ry: 12 },
    ],
    adductors: [
      { t: "path", d: "M47 96 L50 99 L49 120 Q45 112 45 102 Z" },
      { t: "path", d: "M53 96 L50 99 L51 120 Q55 112 55 102 Z" },
    ],
    quads: [
      { t: "ellipse", cx: 41, cy: 119, rx: 7, ry: 21 },
      { t: "ellipse", cx: 59, cy: 119, rx: 7, ry: 21 },
    ],
    calves: [
      { t: "ellipse", cx: 41, cy: 161, rx: 4.5, ry: 14 },
      { t: "ellipse", cx: 59, cy: 161, rx: 4.5, ry: 14 },
    ],
  },
  back: {
    traps: [
      { t: "path", d: "M50 27 L62 33 L56 52 L50 56 L44 52 L38 33 Z" },
    ],
    deltR: [
      { t: "ellipse", cx: 32, cy: 40, rx: 7, ry: 8 },
      { t: "ellipse", cx: 68, cy: 40, rx: 7, ry: 8 },
    ],
    midback: [
      { t: "path", d: "M43 40 L49 44 L49 58 L42 52 Z" },
      { t: "path", d: "M57 40 L51 44 L51 58 L58 52 Z" },
    ],
    lats: [
      { t: "path", d: "M38 44 Q35 58 42 76 L47 70 L41 52 Z" },
      { t: "path", d: "M62 44 Q65 58 58 76 L53 70 L59 52 Z" },
    ],
    triceps: [
      { t: "ellipse", cx: 28, cy: 58, rx: 5, ry: 10 },
      { t: "ellipse", cx: 72, cy: 58, rx: 5, ry: 10 },
    ],
    forearm: [
      { t: "ellipse", cx: 24, cy: 80, rx: 4.5, ry: 11 },
      { t: "ellipse", cx: 76, cy: 80, rx: 4.5, ry: 11 },
    ],
    lowback: [
      { t: "rect", x: 45, y: 62, width: 10, height: 22, rx: 4 },
    ],
    glutes: [
      { t: "ellipse", cx: 43, cy: 96, rx: 7.5, ry: 8 },
      { t: "ellipse", cx: 57, cy: 96, rx: 7.5, ry: 8 },
    ],
    hams: [
      { t: "ellipse", cx: 42, cy: 123, rx: 6.5, ry: 17 },
      { t: "ellipse", cx: 58, cy: 123, rx: 6.5, ry: 17 },
    ],
    calves: [
      { t: "ellipse", cx: 41, cy: 159, rx: 5.5, ry: 14 },
      { t: "ellipse", cx: 59, cy: 159, rx: 5.5, ry: 14 },
    ],
  },
};
