import { describe, expect, it } from "vitest";
import { asksForDosing, detectEmergency, scanDeep, scanOutput } from "@/lib/domain/safety/guardrails";

describe("guardarraíles de salida: bloquea cualquier indicación de insulina o clínica", () => {
  const blocked = [
    "Antes de correr, ponte 2 unidades menos de insulina rápida.",
    "Podrías reducir la basal un 20 % el día de la tirada larga.",
    "Con 60 g de hidratos usa un ratio 1:10.",
    "Tu factor de sensibilidad parece 45.",
    "Si estás alto, inyéctate 3 u de Fiasp.",
    "Suspende la insulina rápida antes del partido.",
    "Sal a caminar para bajar la glucosa si estás en 250.",
    "Toma 15 g de glucosa para subir si estás bajo.",
    "Estás apto para entrenar hoy.",
    "Tienes una cetoacidosis.",
    "Baja la dosis de Lantus a la mitad.",
    "6 UI de Humalog con la cena",
  ];
  for (const t of blocked) it(`bloquea: ${t}`, () => expect(scanOutput(t).ok).toBe(false));
  const allowed = [
    "En tus datos, la glucosa bajó una mediana de 40 mg/dL durante las carreras suaves. Coméntalo con tu equipo.",
    "Tu tiempo en rango fue del 68 % con un 82 % de cobertura.",
    "Esta semana hiciste 3 sesiones de fuerza y 22 km de carrera.",
    "Puedo ayudarte a preparar preguntas sobre el ejercicio para tu consulta.",
    "La comida tenía 65 g de hidratos disponibles.",
    "Sube 2,5 kg en el press de pecho la próxima sesión.",
  ];
  for (const t of allowed) it(`permite: ${t}`, () => expect(scanOutput(t).ok).toBe(true));
  it("escanea salidas estructuradas en profundidad", () => {
    expect(scanDeep({ meta: { warnings: ["ok"] }, days: [{ notes: "reduce la basal un 10 %" }] }).ok).toBe(false);
  });
});

describe("entrada del usuario", () => {
  it("detecta emergencias", () => {
    expect(detectEmergency("Mi pareja está inconsciente y tiene diabetes")).toBe(true);
    expect(detectEmergency("tengo vómitos y las cetonas muy altas")).toBe(true);
    expect(detectEmergency("¿Qué tal mi semana de entrenamiento?")).toBe(false);
  });
  it("detecta peticiones de dosificación", () => {
    expect(asksForDosing("¿Cuántas unidades me pongo antes de correr?")).toBe(true);
    expect(asksForDosing("¿Qué ratio uso?")).toBe(true);
    expect(asksForDosing("¿Cuánto peso levanté?")).toBe(false);
  });
});
