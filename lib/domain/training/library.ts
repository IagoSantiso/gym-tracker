/**
 * Biblioteca de ejercicios. Fotos reales de free-exercise-db (dominio público):
 *  - 18 originales del Gym Tracker (extraídas del HTML v2)
 *  - ampliación mapeada en data/free-exercise-db-map.json (npm run import-exercises)
 * Si un ejercicio no tiene foto fiable, la UI muestra solo el mapa muscular (nunca una foto engañosa).
 */
import type { EquipmentId, MuscleId } from "@/lib/db/types";
import { EXERCISES as ORIGINAL } from "./original";

export type Pattern =
  | "push_h" | "push_v" | "pull_h" | "pull_v" | "squat" | "hinge" | "lunge" | "hip_ext"
  | "knee_flex" | "knee_ext" | "calf" | "elbow_flex" | "elbow_ext" | "shoulder_iso" | "core" | "carry" | "mobility";

export interface LibraryExercise {
  id: string;
  name: string;
  group: string;
  restSec: number;
  main: string;
  sec: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  cues: string[];
  equipment: EquipmentId[];
  category: "compound" | "isolation" | "core" | "mobility";
  pattern: Pattern;
  difficulty: 1 | 2 | 3;
  errors: string[];
  /** contraindicaciones GENERALES orientativas (no sustituyen a un profesional) */
  caution?: string;
  photos: boolean;
  /** incremento sugerido de carga (kg) en progresión doble */
  incrementKg: number;
  /** se registra por tiempo o reps sin carga externa por defecto */
  bodyweight?: boolean;
  custom?: boolean;
}

export const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  machine: "Máquina", barbell: "Barra", dumbbell: "Mancuernas", cable: "Polea", band: "Bandas",
  bodyweight: "Peso corporal", kettlebell: "Kettlebell", bench: "Banco", smith: "Multipower",
  pullup_bar: "Barra dominadas", treadmill: "Cinta", bike: "Bicicleta", other: "Otro",
};

export const MUSCLE_LABEL: Record<MuscleId, string> = {
  traps: "Trapecio", deltF: "Deltoides anterior", deltR: "Deltoides posterior", chest: "Pectoral",
  biceps: "Bíceps", triceps: "Tríceps", forearm: "Antebrazo", abs: "Abdomen", obliques: "Oblicuos",
  adductors: "Aductores", abductors: "Abductores", quads: "Cuádriceps", calves: "Gemelos",
  midback: "Espalda media", lats: "Dorsal", lowback: "Lumbar", glutes: "Glúteos", hams: "Isquiotibiales",
};

/** Metadatos añadidos a los 18 ejercicios originales. */
const ORIGINAL_META: Record<string, Pick<LibraryExercise, "equipment" | "category" | "pattern" | "difficulty" | "errors" | "caution" | "incrementKg" | "bodyweight">> = {
  bench: { equipment: ["machine"], category: "compound", pattern: "push_h", difficulty: 1, incrementKg: 2.5, errors: ["Despegar los hombros del respaldo", "Rebotar al final del recorrido"] },
  incline: { equipment: ["dumbbell", "bench"], category: "compound", pattern: "push_h", difficulty: 2, incrementKg: 2, errors: ["Banco demasiado inclinado (se convierte en press de hombro)", "Bajar sin control"], caution: "Molestias de hombro: reduce el recorrido." },
  fly: { equipment: ["cable"], category: "isolation", pattern: "push_h", difficulty: 1, incrementKg: 2.5, errors: ["Flexionar y extender los codos (convierte el gesto en press)"] },
  shoulder: { equipment: ["dumbbell"], category: "isolation", pattern: "shoulder_iso", difficulty: 1, incrementKg: 1, errors: ["Impulso con el tronco", "Subir por encima del hombro encogiendo el trapecio"] },
  pushdown: { equipment: ["cable"], category: "isolation", pattern: "elbow_ext", difficulty: 1, incrementKg: 2.5, errors: ["Despegar los codos del cuerpo"] },
  overheadtri: { equipment: ["cable"], category: "isolation", pattern: "elbow_ext", difficulty: 1, incrementKg: 2.5, errors: ["Arquear la zona lumbar", "Abrir los codos"], caution: "Hombro sensible: usa la polea baja con menor rango." },
  pulldown: { equipment: ["cable", "machine"], category: "compound", pattern: "pull_v", difficulty: 1, incrementKg: 2.5, errors: ["Tirar con los brazos sin bajar los hombros", "Llevar la barra tras la nuca"] },
  row: { equipment: ["cable"], category: "compound", pattern: "pull_h", difficulty: 1, incrementKg: 2.5, errors: ["Balancear el tronco", "Redondear la espalda al estirar"] },
  chestrow: { equipment: ["dumbbell", "bench"], category: "compound", pattern: "pull_h", difficulty: 1, incrementKg: 2, errors: ["Levantar el pecho del banco"] },
  reversefly: { equipment: ["machine"], category: "isolation", pattern: "shoulder_iso", difficulty: 1, incrementKg: 2.5, errors: ["Encoger los hombros"] },
  curl: { equipment: ["dumbbell"], category: "isolation", pattern: "elbow_flex", difficulty: 1, incrementKg: 1, errors: ["Balancear el cuerpo", "Adelantar los codos"] },
  hammer: { equipment: ["dumbbell"], category: "isolation", pattern: "elbow_flex", difficulty: 1, incrementKg: 1, errors: ["Girar las muñecas"] },
  legpress: { equipment: ["machine"], category: "compound", pattern: "squat", difficulty: 1, incrementKg: 5, errors: ["Despegar la pelvis abajo", "Bloquear las rodillas arriba"], caution: "Rodilla o lumbar sensibles: limita la profundidad." },
  rdl: { equipment: ["dumbbell"], category: "compound", pattern: "hinge", difficulty: 2, incrementKg: 2, errors: ["Redondear la espalda", "Convertirlo en sentadilla flexionando mucho las rodillas"], caution: "Dolor lumbar: empieza con poco peso y recorrido corto." },
  legcurl: { equipment: ["machine"], category: "isolation", pattern: "knee_flex", difficulty: 1, incrementKg: 2.5, errors: ["Despegar la cadera del asiento"] },
  legext: { equipment: ["machine"], category: "isolation", pattern: "knee_ext", difficulty: 1, incrementKg: 2.5, errors: ["Golpear el tope", "Usar impulso"], caution: "Molestia rotuliana: reduce rango y carga." },
  calf: { equipment: ["machine"], category: "isolation", pattern: "calf", difficulty: 1, incrementKg: 5, errors: ["Rebotar", "Recorrido corto"] },
  deadbug: { equipment: ["bodyweight"], category: "core", pattern: "core", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Despegar la zona lumbar del suelo"] },
};

const base: LibraryExercise[] = Object.values(ORIGINAL).map((x) => ({
  id: x.id, name: x.name, group: x.group, restSec: x.rest, main: x.main, sec: x.sec,
  primary: x.primary, secondary: x.secondary, cues: x.cues, photos: true, ...ORIGINAL_META[x.id],
}));

type Extra = Omit<LibraryExercise, "photos">;
const E = (x: Extra): LibraryExercise => ({ ...x, photos: true });

const extra: LibraryExercise[] = [
  E({"id": "crunch", "name": "Crunch abdominal", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Eleva los omóplatos sin tirar del cuello.", "Baja despacio y mantén la pelvis estable."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "reversecrunch", "name": "Crunch inverso", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Acerca las rodillas al tronco elevando ligeramente la pelvis.", "Evita el impulso y baja de forma controlada."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "bicyclecrunch", "name": "Abdominal bicicleta", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Alterna hombro y rodilla contrarios con el cuello relajado.", "Rota el tronco sin tirar de la cabeza."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "heeltouch", "name": "Toques de talón", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Tumbado con rodillas flexionadas, alcanza un talón y luego el otro.", "Usa un recorrido cómodo y respira."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "floorlegraise", "name": "Elevación de piernas en banco", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Eleva las piernas con control y abdomen firme.", "Limita la bajada si se arquea la zona lumbar."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 2, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "kneeraise", "name": "Elevación de rodillas en paralelas", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Apoya los antebrazos y eleva las rodillas.", "No te balancees; controla la bajada."], "equipment": ["pullup_bar"], "category": "core", "pattern": "core", "difficulty": 2, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "machinecrunch", "name": "Crunch en máquina", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Ajusta asiento y apoyos al tamaño de tu cuerpo.", "Flexiona el tronco sin tirar con los brazos."], "equipment": ["machine"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 2.5, "bodyweight": false, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "declinecrunch", "name": "Crunch en banco declinado", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Asegura los pies y eleva los omóplatos.", "Baja controlando, sin forzar el cuello."], "equipment": ["bench"], "category": "core", "pattern": "core", "difficulty": 2, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "obliquecrunch", "name": "Crunch oblicuo en suelo", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Eleva el hombro hacia la cadera contraria.", "Mantén el cuello relajado y alterna ambos lados."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "russiantwist", "name": "Giro ruso", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Sentado con pies apoyados, gira el tronco de lado a lado.", "Usa un recorrido cómodo, sin forzar la zona lumbar."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "toetouch", "name": "Abdominal tocando puntas", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Tumbado, eleva las piernas y acerca las manos a los pies.", "Eleva los omóplatos sin impulsarte con el cuello."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({"id": "tuckcrunch", "name": "Crunch agrupado", "group": "Core", "restSec": 60, "main": "Abdomen", "sec": "Oblicuos", "primary": ["abs"], "secondary": ["obliques"], "cues": ["Acerca rodillas y pecho con control.", "Extiende solo hasta donde mantengas el abdomen firme."], "equipment": ["bodyweight"], "category": "core", "pattern": "core", "difficulty": 1, "incrementKg": 0, "bodyweight": true, "errors": ["Usar impulso en vez de controlar el movimiento"]}),
  E({ id: "squat", name: "Sentadilla con barra", group: "Piernas", restSec: 150, main: "Cuádriceps · glúteo mayor", sec: "Aductores · erectores · core", primary: ["quads", "glutes"], secondary: ["adductors", "lowback", "abs"], cues: ["Pies al ancho de hombros, rodillas en la línea de los pies.", "Baja controlando con el tronco firme y sube empujando el suelo."], equipment: ["barbell"], category: "compound", pattern: "squat", difficulty: 3, incrementKg: 2.5, errors: ["Rodillas hacia dentro", "Perder la curva lumbar abajo"], caution: "Requiere técnica: empieza con barra vacía o variante guiada." }),
  E({ id: "goblet", name: "Sentadilla goblet", group: "Piernas", restSec: 90, main: "Cuádriceps · glúteos", sec: "Core · aductores", primary: ["quads", "glutes"], secondary: ["abs", "adductors"], cues: ["Sujeta la pesa pegada al pecho.", "Baja entre las piernas con el pecho alto."], equipment: ["kettlebell", "dumbbell"], category: "compound", pattern: "squat", difficulty: 1, incrementKg: 2, errors: ["Talones despegados", "Inclinar el tronco en exceso"] }),
  E({ id: "smithsquat", name: "Sentadilla en multipower", group: "Piernas", restSec: 120, main: "Cuádriceps · glúteos", sec: "Aductores", primary: ["quads", "glutes"], secondary: ["adductors"], cues: ["Pies ligeramente adelantados respecto a la barra.", "Controla la bajada y no bloquees arriba."], equipment: ["smith"], category: "compound", pattern: "squat", difficulty: 2, incrementKg: 2.5, errors: ["Pies justo bajo la barra (carga excesiva en rodilla)"] }),
  E({ id: "splitsquat", name: "Sentadilla split con mancuernas", group: "Piernas", restSec: 90, main: "Cuádriceps · glúteos", sec: "Aductores · estabilizadores", primary: ["quads", "glutes"], secondary: ["adductors", "hams"], cues: ["Paso largo, tronco vertical.", "Baja la rodilla trasera hacia el suelo sin golpearlo."], equipment: ["dumbbell"], category: "compound", pattern: "lunge", difficulty: 2, incrementKg: 2, errors: ["Paso demasiado corto", "Rodilla delantera hacia dentro"] }),
  E({ id: "lunge", name: "Zancadas con mancuernas", group: "Piernas", restSec: 90, main: "Cuádriceps · glúteos", sec: "Isquiotibiales · aductores", primary: ["quads", "glutes"], secondary: ["hams", "adductors"], cues: ["Da un paso al frente y baja en vertical.", "Empuja con el talón delantero para volver."], equipment: ["dumbbell"], category: "compound", pattern: "lunge", difficulty: 2, incrementKg: 2, errors: ["Inclinar el tronco hacia delante", "Perder el equilibrio por paso estrecho"] }),
  E({ id: "stepup", name: "Subidas al banco con mancuernas", group: "Piernas", restSec: 90, main: "Cuádriceps · glúteos", sec: "Isquiotibiales · gemelos", primary: ["quads", "glutes"], secondary: ["hams", "calves"], cues: ["Apoya todo el pie en el banco.", "Sube empujando con la pierna de arriba, sin impulsarte con la de abajo."], equipment: ["dumbbell", "bench"], category: "compound", pattern: "lunge", difficulty: 1, incrementKg: 2, errors: ["Impulsarse con la pierna de apoyo"] }),
  E({ id: "hipthrust", name: "Hip thrust con barra", group: "Glúteos", restSec: 120, main: "Glúteo mayor", sec: "Isquiotibiales", primary: ["glutes"], secondary: ["hams"], cues: ["Escápulas apoyadas en el banco y barbilla recogida.", "Extiende la cadera sin hiperextender la zona lumbar."], equipment: ["barbell", "bench"], category: "compound", pattern: "hip_ext", difficulty: 2, incrementKg: 5, errors: ["Arquear la lumbar arriba", "Pies demasiado lejos"] }),
  E({ id: "glutebridge", name: "Puente de glúteo a una pierna", group: "Glúteos", restSec: 60, main: "Glúteo mayor", sec: "Isquiotibiales · core", primary: ["glutes"], secondary: ["hams", "abs"], cues: ["Pelvis nivelada durante todo el movimiento.", "Aprieta el glúteo arriba 1 segundo."], equipment: ["bodyweight"], category: "isolation", pattern: "hip_ext", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Rotar la pelvis"] }),
  E({ id: "deadlift", name: "Peso muerto con barra", group: "Cadena posterior", restSec: 180, main: "Glúteos · isquiotibiales · erectores", sec: "Dorsal · trapecio · antebrazo", primary: ["glutes", "hams", "lowback"], secondary: ["lats", "traps", "forearm", "quads"], cues: ["Barra pegada a las piernas y espalda neutra.", "Empuja el suelo y extiende cadera y rodilla a la vez."], equipment: ["barbell"], category: "compound", pattern: "hinge", difficulty: 3, incrementKg: 5, errors: ["Redondear la espalda", "Alejar la barra del cuerpo"], caution: "Técnica exigente; con dolor lumbar previo consúltalo antes." }),
  E({ id: "backext", name: "Hiperextensiones", group: "Cadena posterior", restSec: 75, main: "Erectores · glúteos", sec: "Isquiotibiales", primary: ["lowback", "glutes"], secondary: ["hams"], cues: ["Bisagra de cadera, columna neutra.", "Sube hasta alinear el cuerpo, sin hiperextender."], equipment: ["other"], category: "isolation", pattern: "hinge", difficulty: 1, incrementKg: 2.5, errors: ["Subir de más arqueando la espalda"] }),
  E({ id: "lyinglegcurl", name: "Curl femoral tumbado", group: "Piernas", restSec: 60, main: "Isquiotibiales", sec: "Gemelo", primary: ["hams"], secondary: ["calves"], cues: ["Cadera pegada al banco.", "Flexiona y baja en 2–3 segundos."], equipment: ["machine"], category: "isolation", pattern: "knee_flex", difficulty: 1, incrementKg: 2.5, errors: ["Levantar la cadera"] }),
  E({ id: "abductor", name: "Abductores en máquina", group: "Glúteos", restSec: 60, main: "Glúteo medio · TFL", sec: "Glúteo mayor", primary: ["abductors"], secondary: ["glutes"], cues: ["Espalda apoyada y movimiento controlado.", "Pausa breve en la apertura."], equipment: ["machine"], category: "isolation", pattern: "hip_ext", difficulty: 1, incrementKg: 2.5, errors: ["Rebotar al cerrar"] }),
  E({ id: "adductor", name: "Aductores en máquina", group: "Piernas", restSec: 60, main: "Aductores", sec: "—", primary: ["adductors"], secondary: [], cues: ["Empieza con un rango cómodo.", "Cierra controlando, sin golpear."], equipment: ["machine"], category: "isolation", pattern: "hip_ext", difficulty: 1, incrementKg: 2.5, errors: ["Rango excesivo al principio"] }),
  E({ id: "seatedcalf", name: "Gemelo sentado", group: "Gemelos", restSec: 60, main: "Sóleo", sec: "Gastrocnemio", primary: ["calves"], secondary: [], cues: ["Baja el talón hasta notar estiramiento.", "Pausa arriba sin rebotes."], equipment: ["machine"], category: "isolation", pattern: "calf", difficulty: 1, incrementKg: 2.5, errors: ["Recorrido corto"] }),
  E({ id: "dbbench", name: "Press banca con mancuernas", group: "Pecho", restSec: 90, main: "Pectoral mayor", sec: "Tríceps · deltoides anterior", primary: ["chest"], secondary: ["triceps", "deltF"], cues: ["Escápulas juntas y pies firmes.", "Baja hasta la altura del pecho con los codos a ~45°."], equipment: ["dumbbell", "bench"], category: "compound", pattern: "push_h", difficulty: 2, incrementKg: 2, errors: ["Codos a 90° del tronco", "Rebotar"] }),
  E({ id: "pushup", name: "Flexiones", group: "Pecho", restSec: 75, main: "Pectoral mayor", sec: "Tríceps · deltoides · core", primary: ["chest"], secondary: ["triceps", "deltF", "abs"], cues: ["Cuerpo en línea de cabeza a talones.", "Baja el pecho hacia el suelo con codos a ~45°."], equipment: ["bodyweight"], category: "compound", pattern: "push_h", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Cadera caída", "Recorrido parcial"] }),
  E({ id: "dbfly", name: "Aperturas con mancuernas", group: "Pecho", restSec: 60, main: "Pectoral mayor", sec: "Deltoides anterior", primary: ["chest"], secondary: ["deltF"], cues: ["Codos ligeramente flexionados y fijos.", "Abre hasta notar estiramiento cómodo."], equipment: ["dumbbell", "bench"], category: "isolation", pattern: "push_h", difficulty: 1, incrementKg: 1, errors: ["Bajar demasiado con mucho peso"], caution: "Hombro inestable: limita el rango." }),
  E({ id: "dbpress", name: "Press de hombro con mancuernas sentado", group: "Hombro", restSec: 90, main: "Deltoides anterior y lateral", sec: "Tríceps · trapecio", primary: ["deltF"], secondary: ["triceps", "traps"], cues: ["Espalda apoyada y abdomen firme.", "Empuja hacia arriba sin chocar las mancuernas."], equipment: ["dumbbell", "bench"], category: "compound", pattern: "push_v", difficulty: 2, incrementKg: 2, errors: ["Arquear la zona lumbar"] }),
  E({ id: "machinepress", name: "Press de hombro en máquina", group: "Hombro", restSec: 90, main: "Deltoides anterior", sec: "Tríceps", primary: ["deltF"], secondary: ["triceps"], cues: ["Asas a la altura de los hombros al empezar.", "Empuja sin bloquear los codos."], equipment: ["machine"], category: "compound", pattern: "push_v", difficulty: 1, incrementKg: 2.5, errors: ["Asiento demasiado bajo"] }),
  E({ id: "ohp", name: "Press militar con barra", group: "Hombro", restSec: 120, main: "Deltoides", sec: "Tríceps · trapecio · core", primary: ["deltF"], secondary: ["triceps", "traps", "abs"], cues: ["Glúteos y abdomen apretados.", "Barra en línea recta; mete la cabeza bajo la barra arriba."], equipment: ["barbell"], category: "compound", pattern: "push_v", difficulty: 3, incrementKg: 2.5, errors: ["Hiperextender la lumbar"], caution: "Movilidad de hombro limitada: usa mancuernas o máquina." }),
  E({ id: "facepull", name: "Face pull en polea", group: "Hombro posterior", restSec: 60, main: "Deltoides posterior · rotadores externos", sec: "Trapecio medio · romboides", primary: ["deltR"], secondary: ["midback", "traps"], cues: ["Cuerda a la altura de la cara.", "Tira separando las manos y rotando hacia fuera."], equipment: ["cable"], category: "isolation", pattern: "pull_h", difficulty: 1, incrementKg: 2.5, errors: ["Tirar con la espalda baja"] }),
  E({ id: "bandpull", name: "Band pull-apart", group: "Hombro posterior", restSec: 45, main: "Deltoides posterior", sec: "Romboides · trapecio medio", primary: ["deltR"], secondary: ["midback"], cues: ["Brazos estirados a la altura del pecho.", "Separa la banda juntando escápulas."], equipment: ["band"], category: "isolation", pattern: "pull_h", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Encoger los hombros"] }),
  E({ id: "pullup", name: "Dominadas", group: "Espalda", restSec: 120, main: "Dorsal ancho", sec: "Bíceps · romboides", primary: ["lats"], secondary: ["biceps", "midback"], cues: ["Empieza colgado con hombros activos.", "Sube llevando el pecho a la barra."], equipment: ["pullup_bar"], category: "compound", pattern: "pull_v", difficulty: 3, incrementKg: 0, bodyweight: true, errors: ["Balanceo", "Medio recorrido"] }),
  E({ id: "assistedpullup", name: "Dominada asistida con banda", group: "Espalda", restSec: 90, main: "Dorsal ancho", sec: "Bíceps · romboides", primary: ["lats"], secondary: ["biceps", "midback"], cues: ["Banda bajo rodilla o pie.", "Controla la bajada hasta brazos estirados."], equipment: ["pullup_bar", "band"], category: "compound", pattern: "pull_v", difficulty: 2, incrementKg: 0, bodyweight: true, errors: ["Rebotar abajo con la banda"] }),
  E({ id: "widepulldown", name: "Jalón agarre ancho", group: "Espalda", restSec: 90, main: "Dorsal ancho", sec: "Redondo mayor · bíceps", primary: ["lats"], secondary: ["biceps", "midback"], cues: ["Agarre algo más ancho que hombros.", "Baja a la parte alta del pecho con el pecho alto."], equipment: ["cable", "machine"], category: "compound", pattern: "pull_v", difficulty: 1, incrementKg: 2.5, errors: ["Echarse atrás en exceso"] }),
  E({ id: "dbrow", name: "Remo a una mano con mancuerna", group: "Espalda", restSec: 75, main: "Dorsal · romboides", sec: "Bíceps · deltoides posterior", primary: ["lats", "midback"], secondary: ["biceps", "deltR"], cues: ["Mano y rodilla apoyadas en el banco, espalda neutra.", "Lleva el codo hacia la cadera."], equipment: ["dumbbell", "bench"], category: "compound", pattern: "pull_h", difficulty: 1, incrementKg: 2, errors: ["Rotar el tronco"] }),
  E({ id: "dips", name: "Fondos en paralelas", group: "Tríceps", restSec: 90, main: "Tríceps · pectoral inferior", sec: "Deltoides anterior", primary: ["triceps", "chest"], secondary: ["deltF"], cues: ["Baja hasta un rango cómodo para el hombro.", "Sube sin bloquear bruscamente."], equipment: ["bodyweight"], category: "compound", pattern: "push_v", difficulty: 3, incrementKg: 0, bodyweight: true, errors: ["Bajar demasiado"], caution: "Hombro sensible: evita o usa máquina asistida." }),
  E({ id: "preacher", name: "Curl en banco Scott (máquina)", group: "Bíceps", restSec: 60, main: "Bíceps braquial", sec: "Braquial", primary: ["biceps"], secondary: ["forearm"], cues: ["Axilas apoyadas en el borde del banco.", "Estira casi del todo controlando."], equipment: ["machine"], category: "isolation", pattern: "elbow_flex", difficulty: 1, incrementKg: 2.5, errors: ["Soltar el peso abajo"] }),
  E({ id: "plank", name: "Plancha", group: "Core", restSec: 45, main: "Recto y transverso abdominal", sec: "Glúteos · hombros", primary: ["abs"], secondary: ["obliques", "glutes"], cues: ["Codos bajo hombros, cuerpo en línea.", "Aprieta glúteos y respira sin perder la posición."], equipment: ["bodyweight"], category: "core", pattern: "core", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Cadera alta o caída"] }),
  E({ id: "sideplank", name: "Plancha lateral", group: "Core", restSec: 45, main: "Oblicuos", sec: "Glúteo medio · cuadrado lumbar", primary: ["obliques"], secondary: ["abductors", "abs"], cues: ["Codo bajo el hombro.", "Cadera alta y cuerpo alineado."], equipment: ["bodyweight"], category: "core", pattern: "core", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Cadera caída"] }),
  E({ id: "cablecrunch", name: "Crunch en polea", group: "Core", restSec: 60, main: "Recto abdominal", sec: "Oblicuos", primary: ["abs"], secondary: ["obliques"], cues: ["De rodillas, cuerda junto a la cabeza.", "Flexiona el tronco, no la cadera."], equipment: ["cable"], category: "core", pattern: "core", difficulty: 1, incrementKg: 2.5, errors: ["Tirar con los brazos"] }),
  E({ id: "pallof", name: "Press Pallof", group: "Core", restSec: 45, main: "Oblicuos · transverso", sec: "Glúteos", primary: ["obliques", "abs"], secondary: ["glutes"], cues: ["De lado a la polea, pies al ancho de cadera.", "Extiende los brazos sin dejar que el tronco rote."], equipment: ["cable", "band"], category: "core", pattern: "core", difficulty: 1, incrementKg: 2.5, errors: ["Rotar el tronco"] }),
  E({ id: "legraise", name: "Elevación de piernas colgado", group: "Core", restSec: 60, main: "Recto abdominal", sec: "Flexores de cadera · oblicuos", primary: ["abs"], secondary: ["obliques"], cues: ["Evita el balanceo.", "Retroversión de pelvis al subir."], equipment: ["pullup_bar"], category: "core", pattern: "core", difficulty: 3, incrementKg: 0, bodyweight: true, errors: ["Balancearse"] }),
  E({ id: "farmer", name: "Paseo del granjero", group: "Cuerpo completo", restSec: 90, main: "Antebrazo · trapecio · core", sec: "Piernas", primary: ["forearm", "traps"], secondary: ["abs", "obliques", "quads"], cues: ["Pesos a los lados, hombros atrás.", "Pasos cortos y firmes."], equipment: ["dumbbell", "kettlebell"], category: "compound", pattern: "carry", difficulty: 1, incrementKg: 2, errors: ["Inclinarse hacia un lado"] }),
  E({ id: "catcow", name: "Movilidad gato-camello", group: "Movilidad", restSec: 0, main: "Columna", sec: "—", primary: ["lowback"], secondary: [], cues: ["Alterna flexión y extensión lenta de columna.", "Respira con el movimiento."], equipment: ["bodyweight"], category: "mobility", pattern: "mobility", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Ir rápido"] }),
  E({ id: "worldsgreatest", name: "Estiramiento \"world's greatest\"", group: "Movilidad", restSec: 0, main: "Cadera · columna torácica", sec: "Isquiotibiales", primary: ["glutes", "hams"], secondary: ["adductors"], cues: ["Zancada larga, codo hacia el pie delantero.", "Rota el tronco abriendo el brazo al techo."], equipment: ["bodyweight"], category: "mobility", pattern: "mobility", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Forzar el rango"] }),
  E({ id: "hipcircles", name: "Círculos de cadera", group: "Movilidad", restSec: 0, main: "Cadera", sec: "—", primary: ["abductors"], secondary: ["glutes"], cues: ["De pie con apoyo si lo necesitas.", "Círculos amplios y lentos en ambos sentidos."], equipment: ["bodyweight"], category: "mobility", pattern: "mobility", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Compensar con la lumbar"] }),
  E({ id: "calfstretch", name: "Estiramiento de gemelo en pared", group: "Movilidad", restSec: 0, main: "Gemelos", sec: "—", primary: ["calves"], secondary: [], cues: ["Talón trasero apoyado, rodilla extendida.", "Mantén 30–45 s sin rebotes."], equipment: ["bodyweight"], category: "mobility", pattern: "mobility", difficulty: 1, incrementKg: 0, bodyweight: true, errors: ["Levantar el talón"] }),
];

export const LIBRARY: LibraryExercise[] = [...base, ...extra];
export const LIBRARY_BY_ID: Record<string, LibraryExercise> = Object.fromEntries(LIBRARY.map((e) => [e.id, e]));

/** Ejercicio por id (biblioteca + personalizados). */
export function findExercise(id: string, custom: LibraryExercise[] = []): LibraryExercise | undefined {
  return LIBRARY_BY_ID[id] ?? custom.find((c) => c.id === id);
}

/**
 * Alternativas deterministas: comparten músculo principal o patrón, preferentemente con OTRO material
 * (máquina ocupada) y menor dificultad (molestias). Orden por puntuación estable.
 */
export function alternativesFor(
  id: string,
  opts: { avoidEquipment?: string[]; available?: string[]; max?: number; pool?: LibraryExercise[] } = {},
): LibraryExercise[] {
  const pool = opts.pool ?? LIBRARY;
  const src = pool.find((e) => e.id === id) ?? LIBRARY_BY_ID[id];
  if (!src) return [];
  const avoid = new Set(opts.avoidEquipment ?? src.equipment);
  const avail = opts.available ? new Set(opts.available) : null;
  return pool
    .filter((e) => e.id !== id && e.category !== "mobility")
    .filter((e) => !avail || e.equipment.some((q) => avail.has(q)))
    .map((e) => {
      const sharedPrimary = e.primary.filter((m) => src.primary.includes(m)).length;
      let score = sharedPrimary * 3 + (e.pattern === src.pattern ? 3 : 0);
      score += e.secondary.filter((m) => src.secondary.includes(m)).length * 0.5;
      if (e.equipment.some((q) => avoid.has(q))) score -= 2.5;
      score -= Math.max(0, e.difficulty - src.difficulty) * 0.5;
      return { e, score, sharedPrimary };
    })
    .filter((x) => x.sharedPrimary > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
    .slice(0, opts.max ?? 3)
    .map((x) => x.e);
}
