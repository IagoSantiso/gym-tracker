"use client";
import { useMemo, useState } from "react";
import {
  ActionButton,
  Field,
  Modal,
  NumInput,
  useToast,
} from "@/components/ui";
import { useLive, useProfile } from "@/lib/db/hooks";
import { all } from "@/lib/db/repo";
import { localDate, localTime, zonedWallToUtc } from "@/lib/domain/time";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/domain/nutrition/recipes";
import { recipeNutrition } from "@/lib/domain/nutrition/calc";
import {
  loadCatalog,
  logFreeMeal,
  logManualMeal,
} from "@/lib/services/nutrition";
import { repeatMeal } from "@/lib/services/diary";
import { hasUnknownEnergy } from "@/lib/domain/nutrition/diary";
import type { MealSlot } from "@/lib/db/types";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function MealLogModal({
  onClose,
  initialDate,
}: {
  onClose: () => void;
  initialDate?: string;
}) {
  const p = useProfile(),
    toast = useToast();
  const cat = useLive(loadCatalog, []);
  const previous =
    useLive(
      async () =>
        (await all("food_logs")).sort((a, b) =>
          b.eatenAt.localeCompare(a.eatenAt),
        ),
      [],
    ) ?? [];
  const [mode, setMode] = useState<"search" | "quick">("search"),
    [q, setQ] = useState("");
  const [slot, setSlot] = useState<MealSlot>("lunch"),
    [date, setDate] = useState(
      () => initialDate ?? localDate(Date.now(), p.timezone),
    ),
    [time, setTime] = useState(() => localTime(Date.now(), p.timezone));
  const [items, setItems] = useState<{ foodId: string; grams: number }[]>([]);
  const [selected, setSelected] = useState<{
    id: string;
    kind: "food" | "recipe";
  } | null>(null);
  const [amount, setAmount] = useState<number | null>(1),
    [unit, setUnit] = useState("g");
  const [title, setTitle] = useState(""),
    [kcal, setKcal] = useState<number | null>(null),
    [protein, setProtein] = useState<number | null>(null),
    [carbs, setCarbs] = useState<number | null>(null),
    [fat, setFat] = useState<number | null>(null),
    [estimated, setEstimated] = useState(false);
  const iso = () => {
    const [year, month, day] = date.split("-").map(Number),
      [hour, minute] = time.split(":").map(Number);
    return new Date(
      zonedWallToUtc({ year, month, day, hour, minute }, p.timezone).ms,
    ).toISOString();
  };
  const food = selected?.kind === "food" ? cat?.food(selected.id) : null,
    recipe = selected?.kind === "recipe" ? cat?.recipe(selected.id) : null;
  const preview = useMemo(
    () =>
      cat && items.length
        ? recipeNutrition(
            items.map((i) => ({ ...i, note: null })),
            cat.food,
            1,
            1,
          ).totals
        : null,
    [cat, items],
  );
  const seen=new Set<string>();
  const recent=[...previous].sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite)||b.eatenAt.localeCompare(a.eatenAt)).filter(l=>{
    if(seen.has(l.title)|| (q&&!normalize(l.title).includes(normalize(q))))return false;
    seen.add(l.title);return true;
  }).slice(0,8);
  const results =
    cat && q.trim()
      ? [
          ...cat.foods
            .filter((f) => normalize(f.name).includes(normalize(q)))
            .map((f) => ({ id: f.id, name: f.name, kind: "food" as const })),
          ...cat.recipes
            .filter((r) => normalize(r.name).includes(normalize(q)))
            .map((r) => ({ id: r.id, name: r.name, kind: "recipe" as const })),
        ].slice(0, 24)
      : [];
  const add = () => {
    if (!amount || amount <= 0 || !cat) return;
    if (food)
      setItems((xs) => [
        ...xs,
        {
          foodId: food.id,
          grams: amount * (unit === "g" ? 1 : (food.unitWeights?.[unit] ?? 1)),
        },
      ]);
    if (recipe) {
      setItems((xs) => [
        ...xs,
        ...recipe.ingredients.map((i) => ({
          foodId: i.foodId,
          grams: (i.grams * amount) / recipe.servings,
        })),
      ]);
      if (!title) setTitle(recipe.name);
    }
    setSelected(null);
    setQ("");
  };
  return (
    <Modal
      open
      title="Añadir comida"
      onClose={onClose}
      footer={
        <ActionButton
          className="btn primary"
          disabled={
            !date ||
            !time ||
            (mode === "search"
              ? !items.length
              : !title.trim() || (kcal == null && carbs == null))
          }
          onRun={async () => {
            if (mode === "search")
              await logFreeMeal({
                date,
                eatenAt: iso(),
                slot,
                title:
                  title.trim() ||
                  items
                    .map((i) => cat?.food(i.foodId)?.name)
                    .filter(Boolean)
                    .join(", "),
                items,
              });
            else
              await logManualMeal({
                date,
                eatenAt: iso(),
                slot,
                title,
                carbsG: carbs,
                kcal,
                proteinG: protein,
                fatG: fat,
                estimated,
              });
            toast("Comida registrada. Tu balance está actualizado.");
            onClose();
          }}
        >
          Guardar comida
        </ActionButton>
      }
    >
      <div className="stack">
        <div className="row">
          <button
            className="chip"
            aria-pressed={mode === "search"}
            onClick={() => setMode("search")}
          >
            Buscar comida
          </button>
          <button
            className="chip"
            aria-pressed={mode === "quick"}
            onClick={() => setMode("quick")}
          >
            Registro rápido
          </button>
        </div>
        <Field label="Momento">
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
          >
            {SLOT_ORDER.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {mode === "search" ? (
          <>
            <Field label="Buscar alimento o plato">
              <input
                autoFocus
                placeholder="Yogur, tostada, arroz…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSelected(null);
                }}
              />
            </Field>
            {!selected && recent.length > 0 && !items.length && (
              <div className="meal-recents">
                <h3>Favoritas y recientes</h3>
                {recent.map((l) => (
                  <ActionButton
                    className="diary-row"
                    key={l.id}
                    onRun={async () => {
                      await repeatMeal(l.id, date, iso(), slot);
                      toast("Comida repetida");
                      onClose();
                    }}
                  >
                    <span>
                      {l.favorite ? "★ " : ""}
                      {l.title}
                      <small>
                        {hasUnknownEnergy(l)
                          ? "Energía sin completar"
                          : `${Math.round(l.totals.kcal)} kcal`}
                      </small>
                    </span>
                    <span>Repetir</span>
                  </ActionButton>
                ))}
              </div>
            )}
            {!selected && results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <button
                    className="diary-row"
                    key={`${r.kind}-${r.id}`}
                    onClick={() => {
                      setSelected(r);
                      setAmount(r.kind === "food" ? 100 : 1);
                      setUnit("g");
                    }}
                  >
                    <span>{r.name}</span>
                    <small>{r.kind === "food" ? "Alimento" : "Plato"}</small>
                  </button>
                ))}
              </div>
            )}
            {q && !selected && !results.length && (
              <p className="small muted">
                No hay coincidencias. Puedes usar Registro rápido o añadir un
                alimento en las herramientas de Comida.
              </p>
            )}
            {selected && (
              <div className="card">
                <h3>{food?.name ?? recipe?.name}</h3>
                <div className="grid g2">
                  <Field label={recipe ? "Raciones" : "Cantidad"}>
                    <NumInput
                      value={amount}
                      onChange={setAmount}
                      ariaLabel="Cantidad de alimento"
                    />
                  </Field>
                  {food && (
                    <Field label="Unidad">
                      <select
                        value={unit}
                        onChange={(e) => {
                          setUnit(e.target.value);
                          setAmount(e.target.value === "g" ? 100 : 1);
                        }}
                      >
                        <option value="g">Gramos</option>
                        {Object.entries(food.unitWeights ?? {})
                          .filter(([, g]) => g > 0)
                          .map(([u, g]) => (
                            <option key={u} value={u}>
                              {u} (~{g} g)
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                </div>
                <button
                  className="btn"
                  disabled={!amount || amount <= 0 || amount > 10000}
                  onClick={add}
                >
                  Añadir al plato
                </button>
              </div>
            )}
            {items.length > 0 && (
              <>
                <Field label="Nombre del plato (opcional)">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                {items.map((i, n) => (
                  <div className="row" key={n}>
                    <span className="grow">
                      {cat?.food(i.foodId)?.name} · {Math.round(i.grams)} g
                    </span>
                    <button
                      className="text-action"
                      aria-label={`Quitar ${cat?.food(i.foodId)?.name}`}
                      onClick={() =>
                        setItems((xs) => xs.filter((_, j) => j !== n))
                      }
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                {preview && (
                  <p className="notice info">
                    {Math.round(preview.kcal)} kcal calculadas ·{" "}
                    {Math.round(preview.proteinG)} g proteína
                    {preview.missing.some(
                      (m) => m.startsWith("kcal:") || m.startsWith("*:"),
                    )
                      ? " · Energía incompleta"
                      : ""}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Field label="Qué has comido">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bocadillo de tortilla"
              />
            </Field>
            <Field label="Energía (kcal)">
              <NumInput value={kcal} onChange={setKcal} ariaLabel="Energía" />
            </Field>
            <label className="switch">
              <input
                type="checkbox"
                checked={estimated}
                onChange={(e) => setEstimated(e.target.checked)}
              />
              Cantidad estimada
            </label>
            <details>
              <summary>Añadir nutrientes (opcional)</summary>
              <div className="grid g3">
                <Field label="Hidratos (g)">
                  <NumInput value={carbs} onChange={setCarbs} />
                </Field>
                <Field label="Proteína (g)">
                  <NumInput value={protein} onChange={setProtein} />
                </Field>
                <Field label="Grasa (g)">
                  <NumInput value={fat} onChange={setFat} />
                </Field>
              </div>
            </details>
          </>
        )}
        <details>
          <summary>Cambiar fecha y hora</summary>
          <div className="grid g2">
            <Field label="Fecha">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Hora">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
        </details>
        <p className="xs dim">
          Añadir comida no elimina platos pendientes del menú. Puedes marcarlos
          como omitidos si ya no los vas a comer.
        </p>
      </div>
    </Modal>
  );
}
