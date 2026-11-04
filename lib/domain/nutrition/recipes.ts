/**
 * Recetas semilla (1 ración). Cantidades en gramos en el ESTADO indicado por el alimento
 * (p. ej. "rice_raw" = arroz pesado en crudo). Los valores nutricionales se calculan, no se escriben.
 */
import type { MealSlot, Recipe, RecipeIngredientData } from "@/lib/db/types";

export interface SeedRecipe extends Omit<Recipe, "createdAt" | "updatedAt"> {
  ingredients: RecipeIngredientData[];
}

const r = (
  id: string, name: string, slots: MealSlot[], prepMin: number, cookMin: number, difficulty: 1 | 2 | 3,
  ingredients: [string, number, string?][], steps: string[], opts: { batch?: boolean; tags?: string[]; cost?: 1 | 2 | 3 } = {},
): SeedRecipe => ({
  id, name, slots, servings: 1, prepMin, cookMin, difficulty, steps, tags: opts.tags ?? [], batchFriendly: !!opts.batch,
  costLevel: opts.cost ?? 2, source: "seed",
  ingredients: ingredients.map(([foodId, grams, note]) => ({ foodId, grams, note: note ?? null })),
});

export const SEED_RECIPES: SeedRecipe[] = [
  // Desayunos
  ...(["ham", "omelette"] as const).flatMap(kind => (["tomato", "lettuce"] as const).map(veg => r(
    `mis-tostadas-${kind}-${veg}`, `Dos tostadas con ${kind === "ham" ? "jamón cocido" : "tortilla francesa"}, ${veg === "tomato" ? "tomate" : "lechuga"} y café con leche`, ["breakfast"], 5, kind === "ham" ? 2 : 6, 1,
    [["bread_whole", 60, "2 tostadas; ajusta al peso de tu pan"], [kind === "ham" ? "ham_cooked" : "egg", kind === "ham" ? 60 : 100], [veg, veg === "tomato" ? 80 : 40], ["olive_oil", 5], ["milk_semi", 150, "leche del café; ajusta tipo y cantidad"], ["coffee_brewed", 60]],
    ["Tuesta las dos rebanadas y lava la verdura.", kind === "ham" ? "Reparte el jamón cocido y la verdura sobre las tostadas; usa el aceite indicado." : "Bate los huevos, cuaja la tortilla francesa con el aceite y acompaña con las tostadas y la verdura.", "Prepara el café y añade la leche. Cantidades iniciales orientativas: personalízalas en Variar ingredientes."], { tags: ["desayuno-habitual"] }))),
  r("avena-yogur-frutos-rojos", "Avena con yogur griego y arándanos", ["breakfast"], 5, 0, 1,
    [["oats", 50], ["greek_yogurt_0", 150], ["blueberries", 80], ["walnuts", 10]],
    ["Mezcla la avena con el yogur (puede reposar la noche anterior).", "Añade los arándanos y las nueces troceadas."], { tags: ["sin cocción"] }),
  r("tostadas-huevo-tomate", "Tostadas integrales con huevo y tomate", ["breakfast", "dinner"], 5, 8, 1,
    [["bread_whole", 70], ["egg", 100, "2 unidades"], ["tomato", 80], ["olive_oil", 5]],
    ["Tuesta el pan y ralla el tomate por encima.", "Haz los huevos a la plancha o revueltos con el aceite."]),
  r("yogur-kiwi-chia", "Yogur con kiwi, chía y almendras", ["breakfast", "snack"], 4, 0, 1,
    [["yogurt_skim", 200], ["kiwi", 100], ["chia", 10], ["almonds", 15]],
    ["Pela y trocea el kiwi.", "Mezcla con el yogur, la chía y las almendras."], { tags: ["sin cocción"] }),
  r("tortilla-claras-espinacas", "Tortilla de claras con espinacas y pan de centeno", ["breakfast", "dinner"], 5, 6, 1,
    [["egg_white", 150], ["egg", 50], ["spinach", 60], ["bread_rye", 50], ["olive_oil", 5]],
    ["Saltea las espinacas con el aceite.", "Añade claras y huevo batidos y cuaja a fuego medio.", "Acompaña con el pan."]),
  r("porridge-platano-cacahuete", "Porridge de avena con plátano y crema de cacahuete", ["breakfast"], 3, 6, 1,
    [["oats", 50], ["milk_semi", 200], ["banana", 60], ["peanut_butter", 10]],
    ["Cuece la avena con la leche 4–5 min removiendo.", "Sirve con plátano en rodajas y la crema de cacahuete."]),
  // Comidas / cenas
  r("pollo-arroz-brocoli", "Pollo a la plancha con arroz y brócoli", ["lunch", "dinner"], 10, 20, 1,
    [["chicken_raw", 150], ["rice_raw", 70, "peso en crudo"], ["broccoli", 150], ["olive_oil", 10]],
    ["Cuece el arroz (≈ 15 min).", "Cocina el brócoli al vapor 5–6 min.", "Haz el pollo a la plancha con el aceite."], { batch: true }),
  r("lentejas-verduras", "Lentejas estofadas con verduras", ["lunch", "dinner"], 15, 40, 2,
    [["lentils_dry", 70, "peso en seco"], ["carrot", 60], ["onion", 50], ["red_pepper", 40], ["tomato_crushed", 60], ["garlic", 5], ["olive_oil", 8]],
    ["Sofríe cebolla, ajo y pimiento con el aceite.", "Añade zanahoria, tomate, lentejas y agua; cuece 35–40 min."], { batch: true, cost: 1 }),
  r("salmon-patata-judias", "Salmón al horno con patata y judías verdes", ["lunch", "dinner"], 10, 25, 1,
    [["salmon_raw", 150], ["potato_raw", 200], ["green_beans", 150], ["olive_oil", 5]],
    ["Hornea la patata en rodajas 15 min a 200 °C.", "Añade el salmón y hornea 10–12 min más.", "Cuece las judías al vapor."], { cost: 3 }),
  r("pasta-atun-tomate", "Pasta con atún y tomate", ["lunch", "dinner"], 5, 15, 1,
    [["pasta_dry", 75, "peso en seco"], ["tuna_water", 80], ["tomato_crushed", 100], ["onion", 40], ["olive_oil", 8]],
    ["Cuece la pasta.", "Sofríe la cebolla, añade el tomate 5 min y el atún al final."], { batch: true, cost: 1 }),
  r("ensalada-garbanzos-atun", "Ensalada de garbanzos con atún y verduras", ["lunch", "dinner"], 10, 0, 1,
    [["chickpeas_cooked", 150], ["tuna_water", 60], ["tomato", 100], ["cucumber", 80], ["red_pepper", 50], ["onion", 20], ["olive_oil", 10]],
    ["Trocea las verduras.", "Mezcla con los garbanzos escurridos y el atún; aliña."], { tags: ["sin cocción"], cost: 1 }),
  r("bowl-quinoa-tofu", "Bowl de quinoa con tofu y verduras", ["lunch", "dinner"], 10, 15, 2,
    [["quinoa_cooked", 160], ["tofu_firm", 150], ["zucchini", 100], ["red_pepper", 60], ["spinach", 40], ["olive_oil", 8]],
    ["Dora el tofu en dados con la mitad del aceite.", "Saltea calabacín y pimiento; sirve sobre la quinoa con espinacas."], { batch: true, tags: ["vegetariano"] }),
  r("ternera-boniato-ensalada", "Ternera magra con boniato y ensalada", ["lunch", "dinner"], 10, 35, 1,
    [["beef_lean_raw", 150], ["sweet_potato_baked", 200, "peso ya asado"], ["lettuce", 80], ["tomato", 80], ["olive_oil", 8]],
    ["Asa el boniato (o usa uno asado del lote).", "Haz la carne a la plancha.", "Acompaña con la ensalada aliñada."], { batch: true }),
  r("bacalao-garbanzos-espinacas", "Bacalao con garbanzos y espinacas", ["lunch", "dinner"], 10, 15, 2,
    [["cod_raw", 160], ["chickpeas_cooked", 120], ["spinach", 100], ["garlic", 5], ["olive_oil", 8]],
    ["Dora el ajo, añade espinacas y garbanzos 4 min.", "Cocina el bacalao a la plancha y sirve encima."]),
  r("cuscus-pollo-verduras", "Cuscús con pollo y verduras asadas", ["lunch", "dinner"], 10, 20, 1,
    [["chicken_raw", 140], ["couscous_cooked", 150, "peso ya hidratado"], ["zucchini", 100], ["red_pepper", 60], ["onion", 40], ["olive_oil", 8]],
    ["Asa las verduras 15 min a 200 °C.", "Hidrata el cuscús y cocina el pollo en tiras."], { batch: true }),
  r("alubias-verduras", "Alubias blancas con verduras", ["lunch", "dinner"], 10, 15, 1,
    [["white_beans_cooked", 200], ["carrot", 50], ["onion", 40], ["red_pepper", 40], ["spinach", 50], ["olive_oil", 8]],
    ["Sofríe las verduras.", "Añade las alubias escurridas y un poco de agua; 10 min a fuego suave."], { batch: true, tags: ["vegetariano"], cost: 1 }),
  r("solomillo-patata-champis", "Solomillo de cerdo con patata y champiñones", ["lunch", "dinner"], 10, 25, 2,
    [["pork_tenderloin_raw", 150], ["potato_raw", 200], ["mushrooms", 100], ["olive_oil", 8]],
    ["Cuece la patata 18–20 min.", "Saltea los champiñones y marca el solomillo en medallones."]),
  r("tortilla-patata-calabacin", "Tortilla de patata y calabacín al horno", ["dinner", "lunch"], 10, 30, 2,
    [["egg", 150, "3 unidades"], ["potato_raw", 150], ["zucchini", 100], ["onion", 40], ["olive_oil", 8]],
    ["Asa patata, calabacín y cebolla en láminas 15 min.", "Mezcla con el huevo batido y hornea 12–15 min a 180 °C."], { batch: true, tags: ["vegetariano"] }),
  r("ensalada-pollo-aguacate-quinoa", "Ensalada templada de pollo, aguacate y quinoa", ["dinner", "lunch"], 10, 10, 1,
    [["chicken_raw", 120], ["quinoa_cooked", 120], ["avocado", 50], ["lettuce", 60], ["tomato", 80], ["olive_oil", 5]],
    ["Haz el pollo a la plancha en tiras.", "Monta la ensalada con la quinoa templada y el aguacate."]),
  r("revuelto-champis-centeno", "Revuelto de huevo con champiñones y pan de centeno", ["dinner"], 5, 8, 1,
    [["egg", 150, "3 unidades"], ["mushrooms", 120], ["spinach", 50], ["bread_rye", 40], ["olive_oil", 5]],
    ["Saltea champiñones y espinacas.", "Añade los huevos y remueve a fuego suave."], { tags: ["vegetariano"] }),
  r("sardinas-ensalada-pan", "Sardinas con ensalada y pan integral", ["dinner", "lunch"], 8, 0, 1,
    [["sardines_oil", 100], ["tomato", 100], ["lettuce", 60], ["onion", 20], ["bread_whole", 50], ["olive_oil", 5]],
    ["Prepara la ensalada.", "Sirve con las sardinas escurridas y el pan."], { tags: ["sin cocción"], cost: 1 }),
  r("crema-calabacin-huevo", "Crema de calabacín con huevo duro", ["dinner"], 10, 25, 1,
    [["zucchini", 300], ["onion", 60], ["potato_raw", 80], ["egg", 100, "2 unidades"], ["olive_oil", 8], ["cottage", 50]],
    ["Pocha la cebolla, añade calabacín y patata con agua y cuece 20 min.", "Tritura con el cottage; sirve con el huevo duro."], { batch: true, tags: ["vegetariano"], cost: 1 }),
  // Snacks y pre/post
  r("fruta-frutos-secos", "Manzana y almendras", ["snack"], 1, 0, 1, [["apple", 180], ["almonds", 20]], ["Lava la fruta y acompaña con las almendras."], { tags: ["sin cocción"] }),
  r("griego-miel-nueces", "Yogur griego con miel y nueces", ["snack", "breakfast"], 2, 0, 1, [["greek_yogurt_0", 170], ["honey", 10], ["walnuts", 15]], ["Mezcla y listo."], { tags: ["sin cocción"] }),
  r("hummus-crudites", "Hummus con zanahoria y pepino", ["snack"], 5, 0, 1, [["hummus", 60], ["carrot", 100], ["cucumber", 100]], ["Corta las verduras en bastones."], { tags: ["sin cocción"] }),
  r("cottage-fresas", "Cottage con fresas", ["snack"], 3, 0, 1, [["cottage", 150], ["strawberries", 150]], ["Lava y trocea las fresas; mezcla."], { tags: ["sin cocción"] }),
  r("edamame-snack", "Edamame", ["snack"], 1, 5, 1, [["edamame", 150]], ["Calienta al microondas o saltea 4–5 min."], { tags: ["vegetariano"] }),
  r("pre-platano-yogur", "Pre-entreno: plátano y yogur", ["pre"], 2, 0, 1, [["banana", 120], ["yogurt_skim", 125]], ["Tómalo 60–90 min antes de entrenar (ajusta según tu plan)."], { tags: ["sin cocción"] }),
  r("pre-tostada-miel", "Pre-entreno: tostada con miel", ["pre"], 3, 2, 1, [["bread_white", 50], ["honey", 10]], ["Tuesta el pan y añade la miel."]),
  r("post-batido-cacao", "Post-entreno: batido de leche, plátano, avena y cacao", ["post", "breakfast"], 3, 0, 1,
    [["milk_semi", 300], ["banana", 100], ["oats", 20], ["cocoa", 8]], ["Tritura todo hasta que quede homogéneo."], { tags: ["sin cocción"] }),
];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Desayuno", lunch: "Comida", dinner: "Cena", snack: "Snack", pre: "Pre-entreno", post: "Post-entreno",
};
export const SLOT_ORDER: MealSlot[] = ["breakfast", "pre", "lunch", "snack", "post", "dinner"];
