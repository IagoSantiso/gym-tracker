/**
 * Alimentos semilla. Fuente: USDA FoodData Central, SR Legacy (abril 2018), dominio público (CC0).
 * Valores por 100 g de porción comestible, transcritos y redondeados; NDB indicado en sourceRef.
 * USDA expresa "carbohidratos por diferencia" (INCLUYEN fibra) → carbBasis "total" y
 * hidratos disponibles = totales − fibra. La sal se deriva del sodio (sal = Na × 2,5).
 * Son genéricos: para productos concretos usa la etiqueta (Open Food Facts o alimento propio).
 */
import type { Food, FoodSource, ShopSection } from "@/lib/db/types";

export const SEED_SOURCES: Omit<FoodSource, "createdAt" | "updatedAt">[] = [
  { id: "usda_sr", name: "USDA FoodData Central · SR Legacy", license: "Dominio público (CC0 1.0)", url: "https://fdc.nal.usda.gov/", version: "SR Legacy 2018-04", attribution: "U.S. Department of Agriculture, Agricultural Research Service" },
  { id: "off", name: "Open Food Facts", license: "ODbL 1.0 (base de datos) · DbCL (contenidos)", url: "https://world.openfoodfacts.org/", version: "API v2", attribution: "© Open Food Facts contributors" },
  { id: "label", name: "Etiqueta del producto", license: "Datos aportados por el usuario", url: null, version: null, attribution: null },
];

type Row = [
  id: string, name: string, state: Food["state"], section: ShopSection, ndb: string,
  kcal: number, protein: number, carbsTotal: number, fiber: number, fat: number, sat: number, sugars: number, sodiumMg: number,
  extra?: Partial<Pick<Food, "yieldFactor" | "rawFoodId" | "unitWeights" | "allergens" | "tags">>,
];

const R: Row[] = [
  // Proteínas animales
  ["chicken_raw", "Pechuga de pollo, cruda", "raw", "carne_pescado", "05062", 120, 22.5, 0, 0, 2.62, 0.56, 0, 45, { yieldFactor: 0.75, tags: ["proteina"] }],
  ["chicken_cooked", "Pechuga de pollo, asada/plancha", "cooked", "carne_pescado", "05064", 165, 31.0, 0, 0, 3.57, 1.01, 0, 74, { rawFoodId: "chicken_raw", tags: ["proteina"] }],
  ["beef_lean_raw", "Ternera picada 95 % magra, cruda", "raw", "carne_pescado", "23557", 137, 21.4, 0, 0, 5.0, 2.26, 0, 66, { yieldFactor: 0.75, tags: ["proteina"] }],
  ["pork_tenderloin_raw", "Solomillo de cerdo, crudo", "raw", "carne_pescado", "10060", 120, 20.95, 0, 0, 3.39, 1.17, 0, 53, { yieldFactor: 0.75, tags: ["proteina"] }],
  ["salmon_raw", "Salmón atlántico (piscifactoría), crudo", "raw", "carne_pescado", "15236", 208, 20.4, 0, 0, 13.4, 3.05, 0, 59, { yieldFactor: 0.8, allergens: ["pescado"], tags: ["proteina", "omega3"] }],
  ["cod_raw", "Bacalao fresco, crudo", "raw", "carne_pescado", "15015", 82, 17.8, 0, 0, 0.67, 0.13, 0, 54, { yieldFactor: 0.8, allergens: ["pescado"], tags: ["proteina"] }],
  ["tuna_water", "Atún claro al natural, escurrido", "as_sold", "legumbres_conservas", "15121", 116, 25.5, 0, 0, 0.82, 0.23, 0, 338, { unitWeights: { lata: 56 }, allergens: ["pescado"], tags: ["proteina"] }],
  ["sardines_oil", "Sardinas en aceite, escurridas", "as_sold", "legumbres_conservas", "15088", 208, 24.62, 0, 0, 11.45, 1.53, 0, 307, { unitWeights: { lata: 85 }, allergens: ["pescado"], tags: ["proteina", "omega3"] }],
  ["egg", "Huevo entero", "raw", "lacteos_huevos", "01123", 143, 12.6, 0.72, 0, 9.51, 3.13, 0.37, 142, { unitWeights: { unidad: 50 }, allergens: ["huevo"], tags: ["proteina"] }],
  ["egg_white", "Clara de huevo", "raw", "lacteos_huevos", "01124", 52, 10.9, 0.73, 0, 0.17, 0, 0.71, 166, { allergens: ["huevo"], tags: ["proteina"] }],
  // Lácteos
  ["yogurt_skim", "Yogur natural desnatado", "as_sold", "lacteos_huevos", "01118", 56, 5.73, 7.68, 0, 0.18, 0.12, 7.68, 77, { unitWeights: { unidad: 125 }, allergens: ["lactosa"] }],
  ["greek_yogurt_0", "Yogur griego natural 0 %", "as_sold", "lacteos_huevos", "01256", 59, 10.19, 3.6, 0, 0.39, 0.12, 3.24, 36, { allergens: ["lactosa"], tags: ["proteina"] }],
  ["milk_semi", "Leche semidesnatada (2 %)", "as_sold", "lacteos_huevos", "01079", 50, 3.3, 4.8, 0, 1.98, 1.26, 4.8, 47, { allergens: ["lactosa"] }],
  ["milk_skim", "Leche desnatada", "as_sold", "lacteos_huevos", "01151", 34, 3.37, 4.96, 0, 0.08, 0.06, 5.09, 42, { allergens: ["lactosa"] }],
  ["cottage", "Queso cottage 2 %", "as_sold", "lacteos_huevos", "01016", 84, 11.04, 4.31, 0, 2.27, 1.24, 4.0, 308, { allergens: ["lactosa"], tags: ["proteina"] }],
  ["mozzarella_light", "Mozzarella semidesnatada", "as_sold", "lacteos_huevos", "01028", 254, 24.3, 2.77, 0, 15.9, 10.1, 1.13, 619, { allergens: ["lactosa"] }],
  // Proteína vegetal y legumbres
  ["tofu_firm", "Tofu firme", "as_sold", "otros", "16127", 144, 17.3, 2.78, 2.3, 8.72, 1.26, 0.6, 14, { allergens: ["soja"], tags: ["proteina", "vegetal"] }],
  ["edamame", "Edamame (congelado, preparado)", "cooked", "congelados", "11212", 121, 11.91, 8.91, 5.2, 5.2, 0.62, 2.18, 6, { allergens: ["soja"], tags: ["proteina", "vegetal"] }],
  ["lentils_dry", "Lentejas, secas", "raw", "legumbres_conservas", "16069", 352, 24.63, 63.35, 10.7, 1.06, 0.15, 2.03, 6, { yieldFactor: 2.5, tags: ["legumbre"] }],
  ["lentils_cooked", "Lentejas, cocidas", "cooked", "legumbres_conservas", "16070", 116, 9.02, 20.13, 7.9, 0.38, 0.05, 1.8, 2, { rawFoodId: "lentils_dry", tags: ["legumbre"] }],
  ["chickpeas_cooked", "Garbanzos, cocidos", "cooked", "legumbres_conservas", "16057", 164, 8.86, 27.42, 7.6, 2.59, 0.27, 4.8, 7, { tags: ["legumbre"] }],
  ["white_beans_cooked", "Alubias blancas, cocidas", "cooked", "legumbres_conservas", "16050", 139, 9.73, 25.09, 6.3, 0.35, 0.09, 0.34, 6, { tags: ["legumbre"] }],
  ["hummus", "Hummus", "as_sold", "otros", "16158", 166, 7.9, 14.29, 6.0, 9.6, 1.44, 0.27, 379, { allergens: ["sesamo"], tags: ["legumbre"] }],
  ["peas_frozen", "Guisantes congelados", "raw", "congelados", "11312", 77, 5.22, 13.62, 4.5, 0.4, 0.07, 4.73, 108, { tags: ["legumbre"] }],
  // Cereales y tubérculos
  ["rice_raw", "Arroz blanco, crudo", "raw", "panaderia_cereales", "20444", 365, 7.13, 79.95, 1.3, 0.66, 0.18, 0.12, 5, { yieldFactor: 2.8, allergens: [] }],
  ["rice_cooked", "Arroz blanco, cocido", "cooked", "panaderia_cereales", "20045", 130, 2.69, 28.17, 0.4, 0.28, 0.08, 0.05, 1, { rawFoodId: "rice_raw" }],
  ["brown_rice_cooked", "Arroz integral, cocido", "cooked", "panaderia_cereales", "20037", 123, 2.74, 25.58, 1.6, 0.97, 0.26, 0.24, 4, {}],
  ["pasta_dry", "Pasta de trigo, seca", "raw", "panaderia_cereales", "20120", 371, 13.04, 74.67, 3.2, 1.51, 0.28, 2.67, 6, { yieldFactor: 2.4, allergens: ["gluten"] }],
  ["pasta_cooked", "Pasta de trigo, cocida", "cooked", "panaderia_cereales", "20121", 158, 5.8, 30.86, 1.8, 0.93, 0.18, 0.56, 1, { rawFoodId: "pasta_dry", allergens: ["gluten"] }],
  ["couscous_cooked", "Cuscús, cocido", "cooked", "panaderia_cereales", "20029", 112, 3.79, 23.22, 1.4, 0.16, 0.03, 0.1, 5, { allergens: ["gluten"] }],
  ["quinoa_cooked", "Quinoa, cocida", "cooked", "panaderia_cereales", "20137", 120, 4.4, 21.3, 2.8, 1.92, 0.23, 0.87, 7, {}],
  ["oats", "Copos de avena", "as_sold", "panaderia_cereales", "08120", 389, 16.89, 66.27, 10.6, 6.9, 1.22, 1.0, 2, { allergens: ["gluten"], tags: ["integral"] }],
  ["bread_whole", "Pan integral de trigo", "as_sold", "panaderia_cereales", "18075", 247, 12.95, 41.29, 6.8, 3.35, 0.72, 5.57, 400, { unitWeights: { rebanada: 35 }, allergens: ["gluten"], tags: ["integral"] }],
  ["bread_white", "Pan blanco", "as_sold", "panaderia_cereales", "18069", 266, 7.64, 50.61, 2.4, 3.29, 0.72, 5.0, 490, { unitWeights: { rebanada: 30 }, allergens: ["gluten"] }],
  ["bread_rye", "Pan de centeno", "as_sold", "panaderia_cereales", "18060", 259, 8.5, 48.3, 5.8, 3.3, 0.63, 3.85, 603, { unitWeights: { rebanada: 32 }, allergens: ["gluten"] }],
  ["potato_raw", "Patata, cruda (con piel)", "raw", "fruta_verdura", "11352", 77, 2.05, 17.49, 2.1, 0.09, 0.03, 0.82, 6, { yieldFactor: 1.0 }],
  ["potato_boiled", "Patata cocida, sin piel", "cooked", "fruta_verdura", "11367", 86, 1.71, 20.01, 1.8, 0.1, 0.03, 0.85, 5, { rawFoodId: "potato_raw" }],
  ["sweet_potato_baked", "Boniato asado (con piel)", "cooked", "fruta_verdura", "11508", 90, 2.01, 20.71, 3.3, 0.15, 0.05, 6.48, 36, {}],
  // Verduras
  ["broccoli", "Brócoli", "raw", "fruta_verdura", "11090", 34, 2.82, 6.64, 2.6, 0.37, 0.04, 1.7, 33, {}],
  ["spinach", "Espinacas", "raw", "fruta_verdura", "11457", 23, 2.86, 3.63, 2.2, 0.39, 0.06, 0.42, 79, {}],
  ["tomato", "Tomate", "raw", "fruta_verdura", "11529", 18, 0.88, 3.89, 1.2, 0.2, 0.03, 2.63, 5, { unitWeights: { unidad: 120 } }],
  ["tomato_crushed", "Tomate triturado (conserva)", "as_sold", "legumbres_conservas", "11693", 32, 1.64, 7.29, 1.9, 0.28, 0.04, 4.4, 132, {}],
  ["lettuce", "Lechuga romana", "raw", "fruta_verdura", "11251", 17, 1.23, 3.29, 2.1, 0.3, 0.04, 1.19, 8, {}],
  ["red_pepper", "Pimiento rojo", "raw", "fruta_verdura", "11821", 31, 0.99, 6.03, 2.1, 0.3, 0.03, 4.2, 4, { unitWeights: { unidad: 150 } }],
  ["onion", "Cebolla", "raw", "fruta_verdura", "11282", 40, 1.1, 9.34, 1.7, 0.1, 0.04, 4.24, 4, { unitWeights: { unidad: 110 } }],
  ["zucchini", "Calabacín", "raw", "fruta_verdura", "11477", 17, 1.21, 3.11, 1.0, 0.32, 0.08, 2.5, 8, { unitWeights: { unidad: 200 } }],
  ["carrot", "Zanahoria", "raw", "fruta_verdura", "11124", 41, 0.93, 9.58, 2.8, 0.24, 0.04, 4.74, 69, { unitWeights: { unidad: 70 } }],
  ["mushrooms", "Champiñones", "raw", "fruta_verdura", "11260", 22, 3.09, 3.26, 1.0, 0.34, 0.05, 1.98, 5, {}],
  ["green_beans", "Judías verdes", "raw", "fruta_verdura", "11052", 31, 1.83, 6.97, 2.7, 0.22, 0.05, 3.26, 6, {}],
  ["cucumber", "Pepino (con piel)", "raw", "fruta_verdura", "11205", 15, 0.65, 3.63, 0.5, 0.11, 0.04, 1.67, 2, { unitWeights: { unidad: 300 } }],
  ["garlic", "Ajo", "raw", "fruta_verdura", "11215", 149, 6.36, 33.06, 2.1, 0.5, 0.09, 1.0, 17, { unitWeights: { diente: 3 } }],
  // Fruta
  ["banana", "Plátano", "raw", "fruta_verdura", "09040", 89, 1.09, 22.84, 2.6, 0.33, 0.11, 12.23, 1, { unitWeights: { unidad: 118 } }],
  ["apple", "Manzana (con piel)", "raw", "fruta_verdura", "09003", 52, 0.26, 13.81, 2.4, 0.17, 0.03, 10.39, 1, { unitWeights: { unidad: 180 } }],
  ["orange", "Naranja", "raw", "fruta_verdura", "09200", 47, 0.94, 11.75, 2.4, 0.12, 0.02, 9.35, 0, { unitWeights: { unidad: 130 } }],
  ["strawberries", "Fresas", "raw", "fruta_verdura", "09316", 32, 0.67, 7.68, 2.0, 0.3, 0.02, 4.89, 1, {}],
  ["blueberries", "Arándanos", "raw", "fruta_verdura", "09050", 57, 0.74, 14.49, 2.4, 0.33, 0.03, 9.96, 1, {}],
  ["kiwi", "Kiwi", "raw", "fruta_verdura", "09148", 61, 1.14, 14.66, 3.0, 0.52, 0.03, 8.99, 3, { unitWeights: { unidad: 75 } }],
  ["avocado", "Aguacate", "raw", "fruta_verdura", "09037", 160, 2.0, 8.53, 6.7, 14.66, 2.13, 0.66, 7, { unitWeights: { unidad: 150 } }],
  // Grasas, frutos secos y otros
  ["olive_oil", "Aceite de oliva", "as_sold", "despensa", "04053", 884, 0, 0, 0, 100, 13.81, 0, 2, { unitWeights: { cucharada: 10, cucharadita: 4 } }],
  ["almonds", "Almendras", "as_sold", "despensa", "12061", 579, 21.15, 21.55, 12.5, 49.93, 3.8, 4.35, 1, { allergens: ["frutos_secos"] }],
  ["walnuts", "Nueces", "as_sold", "despensa", "12155", 654, 15.23, 13.71, 6.7, 65.21, 6.13, 2.61, 2, { allergens: ["frutos_secos"] }],
  ["peanut_butter", "Crema de cacahuete", "as_sold", "despensa", "16098", 588, 25.09, 19.56, 6.0, 50.39, 10.3, 9.22, 459, { unitWeights: { cucharada: 16 }, allergens: ["cacahuete"] }],
  ["chia", "Semillas de chía", "as_sold", "despensa", "12006", 486, 16.54, 42.12, 34.4, 30.74, 3.33, 0, 16, { unitWeights: { cucharada: 12 } }],
  ["honey", "Miel", "as_sold", "despensa", "19296", 304, 0.3, 82.4, 0.2, 0, 0, 82.12, 4, { unitWeights: { cucharadita: 7 } }],
  ["cocoa", "Cacao puro en polvo (sin azúcar)", "as_sold", "despensa", "19165", 228, 19.6, 57.9, 37.0, 13.7, 8.07, 1.75, 21, { unitWeights: { cucharada: 5 } }],
  ["dark_chocolate", "Chocolate negro 70–85 %", "as_sold", "despensa", "19904", 598, 7.79, 45.9, 10.9, 42.63, 24.49, 23.99, 20, { unitWeights: { onza: 10 }, allergens: ["lactosa"] }],
];

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export const SEED_FOODS: Omit<Food, "createdAt" | "updatedAt">[] = R.map(
  ([id, name, state, section, ndb, kcal, protein, carbsTotal, fiber, fat, sat, sugars, sodiumMg, extra]) => ({
    id,
    name,
    brand: null,
    barcode: null,
    state,
    per100: {
      kcal, proteinG: protein, carbsTotalG: carbsTotal, fiberG: fiber,
      carbsAvailableG: round(Math.max(0, carbsTotal - fiber)), fatG: fat, satFatG: sat, sugarsG: sugars,
      saltG: round((sodiumMg * 2.5) / 1000),
    },
    carbBasis: "total",
    sourceId: "usda_sr",
    sourceRef: `NDB ${ndb}`,
    sourceVersion: "SR Legacy 2018-04",
    retrievedAt: "2026-11-01T00:00:00.000Z",
    section,
    yieldFactor: extra?.yieldFactor ?? null,
    rawFoodId: extra?.rawFoodId ?? null,
    unitWeights: extra?.unitWeights ?? null,
    tags: extra?.tags ?? [],
    allergens: extra?.allergens ?? [],
    notes: "Valor genérico de referencia; puede diferir de tu producto.",
    source: "seed",
  }),
);

// Explicit generic estimates: replace with the user's product label when available.
SEED_SOURCES.push({ id: "generic_estimate", name: "Referencia genérica estimada", license: "Estimación orientativa de la app; no etiqueta de fabricante", url: null, version: "2026-11", attribution: null });
const estimatedFood = (id: string, name: string, state: Food["state"], kcal: number, proteinG: number, fatG: number, carbsAvailableG: number, allergens: string[], section: ShopSection): Omit<Food, "createdAt" | "updatedAt"> => ({ id, name, state, section, sourceId: "generic_estimate", source: "estimated", sourceRef: "Referencia aproximada, no medida ni etiqueta de producto", carbBasis: "available", per100: { kcal, proteinG, fatG, carbsAvailableG, carbsTotalG: null, fiberG: 0, satFatG: null, sugarsG: null, saltG: null }, allergens, tags: ["estimado"], notes: "Valores aproximados. Sustituye por la etiqueta de tu producto para mayor precisión.", unitWeights: null });
SEED_FOODS.push(
  { ...estimatedFood("ham_cooked", "Jamón cocido (referencia Campofrío Extra)", "as_sold", 130, 18, 6, 1, [], "carne_pescado"), source: "imported", sourceId: "label", sourceRef: "https://www.campofrio.es/p/jamon-cocido-extra", per100: { kcal: 130, proteinG: 18, fatG: 6, carbsAvailableG: 1, carbsTotalG: null, fiberG: null, satFatG: 2.4, sugarsG: 1, saltG: 1.9 }, notes: "Ficha del fabricante consultada 2026-11-04. Referencia para calcular: revisa la etiqueta de tu jamón, que puede ser otro producto." },
  { ...estimatedFood("seabass_raw", "Lubina, carne cruda (referencia CoFID)", "raw", 168, 20, 9.8, 0, ["pescado"], "carne_pescado"), sourceId: "generic_estimate", sourceRef: "Seafish / CoFID 2021: https://www.gov.uk/government/uploads/system/uploads/attachment_data/file/167923/Nutrient_analysis_of_fish_and_fish_products_-_Analytical_Report.pdf", notes: "Referencia CoFID publicada por Seafish: 168 kcal, 20 g proteína y 9,8 g grasa por 100 g de carne cruda. Varía por origen; no es peso de pescado entero." },
  { ...estimatedFood("seabream_raw", "Dorada, carne cruda (referencia IPMA)", "raw", 150.9, 17.8, 8.3, 0, ["pescado"], "carne_pescado"), sourceRef: "https://www.ipma.pt/resources.www/docs/publicacoes.site/pescado/site/dourada/dour_main.htm", notes: "IPMA: composición aproximada de la parte comestible cruda; no es peso de pescado entero. Varía por origen." },
  estimatedFood("coffee_brewed", "Café preparado sin azúcar (referencia estimada)", "as_sold", 1, 0.1, 0, 0, [], "bebidas"),
);
export const SEED_FOOD_BY_ID: Record<string, (typeof SEED_FOODS)[number]> = Object.fromEntries(SEED_FOODS.map((f) => [f.id, f]));

export const SECTION_LABEL: Record<ShopSection, string> = {
  fruta_verdura: "Fruta y verdura", carne_pescado: "Carne y pescado", lacteos_huevos: "Lácteos y huevos",
  panaderia_cereales: "Pan y cereales", legumbres_conservas: "Legumbres y conservas", despensa: "Despensa",
  congelados: "Congelados", bebidas: "Bebidas", otros: "Otros",
};

export const ALLERGENS: { id: string; label: string }[] = [
  { id: "gluten", label: "Gluten" }, { id: "lactosa", label: "Lácteos/lactosa" }, { id: "huevo", label: "Huevo" },
  { id: "pescado", label: "Pescado" }, { id: "marisco", label: "Marisco" }, { id: "frutos_secos", label: "Frutos secos" },
  { id: "cacahuete", label: "Cacahuete" }, { id: "soja", label: "Soja" }, { id: "sesamo", label: "Sésamo" },
];
