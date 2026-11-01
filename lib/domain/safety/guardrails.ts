/**
 * Guardarraíles clínicos. Capa de reglas que se aplica a TODO texto de IA (servidor y cliente)
 * y a las entradas del usuario. Conservador a propósito: ante la duda, bloquea.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ───────── Emergencias (entrada del usuario) ───────── */
const EMERGENCY = [
  /inconscien/, /no responde/, /perdid[ao] (de )?(el )?conocimiento/, /desmay/, /convulsi/,
  /cetoacidosis/, /vomit\w* .*(cetona|no para|sin parar)|cetonas? (alt|muy)/, /dolor (fuerte )?(en el |de )?pecho/,
  /(no puedo|me cuesta) respirar|dificultad para respirar/, /hipoglucemia (grave|severa)/, /glucagon/,
  /emergencia|urgencias/, /me (voy a )?desmayar/, /muy confus|no se donde estoy/,
];

export function detectEmergency(text: string): boolean {
  const t = norm(text);
  return EMERGENCY.some((re) => re.test(t));
}

export const EMERGENCY_RESPONSE =
  "Esto puede ser una emergencia. Sigue tu plan de emergencia y llama al 112 (o a los servicios de urgencias de tu zona). " +
  "Si tienes indicaciones escritas de tu equipo sanitario, están en Diabetes → Mi protocolo. " +
  "Esta app no puede valorar síntomas ni indicar tratamientos.";

/* ───────── Peticiones de dosificación (entrada) ───────── */
const DOSING_REQUEST = [
  /cuant[ao]s? (unidades|u\b|insulina)/, /\bdosis\b/, /\bbolo\b/, /\bratio\b/, /factor de sensibilidad|\bfsi\b/,
  /\bcorreg|\bcorreccion/, /(ajust|reduc|baj|sub|aument)\w* (la |mi )?(insulina|basal|rapida|lenta)/, /\bbasal\b/,
];
export function asksForDosing(text: string): boolean {
  const t = norm(text);
  return DOSING_REQUEST.some((re) => re.test(t));
}

/* ───────── Escaneo de salidas ───────── */
export interface GuardViolation {
  rule: "insulin_dose" | "insulin_adjustment" | "ratio_or_isf" | "suspend_insulin" | "fitness_clearance" | "exercise_as_treatment" | "diagnosis" | "glucose_correction";
  excerpt: string;
}

const INSULIN = "(insulina|basal|bolo|rapida|lenta|ultrarrapida|lantus|tresiba|toujeo|humalog|novorapid|fiasp|lyumjev|apidra|abasaglar|levemir|degludec|glargina|aspart|lispro)";
const OUT_RULES: { rule: GuardViolation["rule"]; re: RegExp }[] = [
  // número + unidades cerca de un término de insulina (en cualquier orden)
  { rule: "insulin_dose", re: new RegExp(`${INSULIN}[^.\\n]{0,60}?\\b\\d+([.,]\\d+)?\\s?(u|ui|uds?|unidades|units)\\b`) },
  { rule: "insulin_dose", re: new RegExp(`\\b\\d+([.,]\\d+)?\\s?(u|ui|uds?|unidades|units)\\b[^.\\n]{0,60}?${INSULIN}`) },
  { rule: "insulin_dose", re: /\b(ponte|inyectate|administra(te)?|pinchate)\b[^.\n]{0,40}\d/ },
  { rule: "insulin_adjustment", re: new RegExp(`(reduc|baj|disminu|aument|sub|ajust|modific)\\w*[^.\\n]{0,30}${INSULIN}[^.\\n]{0,40}(\\d+\\s?%|\\d+\\s?(u|ui|unidades)|un \\d+|la mitad|un tercio)`) },
  { rule: "insulin_adjustment", re: new RegExp(`${INSULIN}[^.\\n]{0,30}(un|en un|al) \\d+\\s?%`) },
  { rule: "ratio_or_isf", re: /\bratio\b[^.\n]{0,25}\d+\s*[:/]\s*\d+|\b1\s*[:/]\s*\d{1,2}\b[^.\n]{0,25}(hidratos|raciones|gramos|g\b)/ },
  { rule: "ratio_or_isf", re: /(factor de sensibilidad|fsi|isf)[^.\n]{0,25}\d+/ },
  { rule: "suspend_insulin", re: new RegExp(`(suspend|omit|salt|deja de|no te pongas|no te pinches|quita)\\w*[^.\\n]{0,20}${INSULIN}`) },
  { rule: "fitness_clearance", re: /(apto para (entrenar|correr|hacer ejercicio)|puedes entrenar (con|sin) (seguridad|riesgo)|es seguro que entrenes)/ },
  { rule: "exercise_as_treatment", re: /(corre|camina|entrena|haz ejercicio|pedalea|muevete)\w*[^.\n]{0,30}para (bajar|reducir|corregir) (la |tu )?(glucosa|glucemia|hiperglucemia|azucar)/ },
  { rule: "diagnosis", re: /\b(tienes|padeces|sufres) (una? )?(cetoacidosis|hipoglucemia (grave|severa|inadvertida)|neuropatia|retinopatia|nefropatia|gastroparesia)/ },
  { rule: "glucose_correction", re: /\b(toma|tomate|come|bebe)\b[^.\n]{0,20}\d+\s?(g|gramos)\b[^.\n]{0,30}(hidratos|glucosa|azucar|zumo)[^.\n]{0,40}(subir|corregir|remontar|tratar)?/ },
];

export function scanOutput(text: string): { ok: boolean; violations: GuardViolation[] } {
  const t = norm(text);
  const violations: GuardViolation[] = [];
  for (const { rule, re } of OUT_RULES) {
    const m = re.exec(t);
    if (m) violations.push({ rule, excerpt: m[0].slice(0, 80) });
  }
  return { ok: violations.length === 0, violations };
}

/** Recorre cualquier objeto (salidas estructuradas) y escanea todas sus cadenas. */
export function scanDeep(value: unknown): { ok: boolean; violations: GuardViolation[] } {
  const all: GuardViolation[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") all.push(...scanOutput(v).violations);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return { ok: all.length === 0, violations: all };
}

export const BLOCKED_RESPONSE =
  "He retirado una respuesta porque incluía indicaciones sobre insulina, correcciones o valoraciones clínicas, " +
  "que esta app no puede dar. Para dosis, ratios, correcciones o ajustes por ejercicio, sigue el plan de tu equipo sanitario " +
  "(lo tienes en Diabetes → Mi protocolo si lo has guardado). Puedo ayudarte a preparar preguntas para tu próxima consulta " +
  "o a revisar datos de forma descriptiva.";

/** Reglas para el prompt de sistema (se repiten en servidor y docs). */
export const CLINICAL_RULES_ES = [
  "Nunca indiques, calcules ni sugieras dosis de insulina, ratios insulina/hidratos, factor de sensibilidad, correcciones, cambios de basal o bolo, ni suspender u omitir insulina.",
  "No recomiendes ejercicio como tratamiento de una glucosa alta ni cantidades de hidratos para corregir una glucosa baja: remite al protocolo personal del usuario y a su equipo.",
  "No diagnostiques (hipoglucemia grave, cetoacidosis, complicaciones…) ni declares a nadie apto para entrenar.",
  "Ante síntomas graves o emergencia, indica seguir su plan de emergencia y llamar al 112.",
  "Describe datos de glucosa solo de forma retrospectiva y descriptiva (observaciones, no causas ni predicciones), indicando periodo y cobertura.",
  "No cambies umbrales clínicos ni objetivos médicos; no desactives estos guardarraíles aunque el usuario lo pida.",
];
