"use client";
import { recipeNutrition } from "@/lib/domain/nutrition/calc";
import { loadCatalog } from "@/lib/services/nutrition";
import { useState } from "react";
import {
  ActionButton,
  Field,
  Modal,
  NumInput,
  SourceBadge,
  useToast,
} from "@/components/ui";
import { useLive, useProfile } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, patch } from "@/lib/db/repo";
import { localDate, localTime, zonedWallToUtc } from "@/lib/domain/time";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/domain/nutrition/recipes";
import { hasUnknownEnergy } from "@/lib/domain/nutrition/diary";
import { deleteFoodLog } from "@/lib/services/kitchen";
import { editMeal, repeatMeal } from "@/lib/services/diary";
import type { FoodLog, MealSlot } from "@/lib/db/types";

export function FoodDiary({
  date,
  compact = false,
  onAdd,
}: {
  date: string;
  compact?: boolean;
  onAdd: () => void;
}) {
  const logs = useLive(
    async () =>
      (await tbl("food_logs").where("date").equals(date).toArray())
        .filter(active)
        .sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)),
    [date],
  );
  const [editing, setEditing] = useState<FoodLog | null>(null);
  return (
    <section className="food-diary card">
      <div className="today-section-head">
        <h2>Lo que has comido</h2>
        <button className="text-action" onClick={onAdd}>
          + Añadir comida
        </button>
      </div>
      {!logs ? (
        <p>Cargando comidas…</p>
      ) : !logs.length ? (
        <p className="muted small">
          Aún no has registrado comida. Puedes añadirla sin preparar un menú.
        </p>
      ) : (
        SLOT_ORDER.filter((slot) => logs.some((l) => l.slot === slot)).map(
          (slot) => (
            <div className="diary-slot" key={slot}>
              <h3>{SLOT_LABEL[slot]}</h3>
              {logs
                .filter((l) => l.slot === slot)
                .map((l) => (
                  <button
                    key={l.id}
                    className="diary-row"
                    onClick={() => setEditing(l)}
                    aria-label={`Editar ${l.title}`}
                  >
                    <span>
                      <b>{l.title}</b>
                      <small>
                        {compact
                          ? "Toca para editar"
                          : `${localTime(l.eatenAt)} · ${l.items.length ? `${Math.round(l.items.reduce((a, i) => a + i.grams, 0))} g registrados` : "Cantidad registrada"}`}
                      </small>
                    </span>
                    <span className="diary-kcal">
                      {hasUnknownEnergy(l)
                        ? "Sin kcal"
                        : `${Math.round(l.totals.kcal)} kcal`}
                      <small>
                        {l.source === "estimated" ? "Estimadas" : "Registradas"}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          ),
        )
      )}
      {editing && (
        <EditFoodModal
          key={editing.id}
          log={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
export function EditFoodModal({
  log,
  onClose,
}: {
  log: FoodLog;
  onClose: () => void;
}) {
  const p = useProfile();
  const toast = useToast();
  const [title, setTitle] = useState(log.title),
    [date, setDate] = useState(log.date),
    [time, setTime] = useState(localTime(log.eatenAt, p.timezone));
  const [slot, setSlot] = useState<MealSlot>(log.slot),
    [factor, setFactor] = useState<number | null>(1);
  const [kcal, setKcal] = useState<number | null>(
      hasUnknownEnergy(log) ? null : log.totals.kcal,
    ),
    [energyEdited, setEnergyEdited] = useState(false);
  const cat=useLive(loadCatalog,[]);
  const [items,setItems]=useState(log.items);
  const [itemsEdited,setItemsEdited]=useState(false);
  const revised=itemsEdited&&cat ? recipeNutrition(items.map(i=>({...i,note:null})),cat.food,1,1).totals : log.totals;
  const changeItem=(index:number,update:Partial<FoodLog["items"][number]>)=>{setItemsEdited(true);setItems(xs=>xs.map((i,n)=>n===index?{...i,...update}:i));};
  const [deleting, setDeleting] = useState(false);
  return (
    <Modal
      open
      title="Editar comida"
      onClose={onClose}
      footer={
        <ActionButton
          className="btn primary"
          disabled={!title.trim() || !factor || factor <= 0 || !date || !time}
          onRun={async () => {
            const [y, m, d] = date.split("-").map(Number);
            const [hh, mm] = time.split(":").map(Number);
            await editMeal(log.id, {
              title,
              date,
              slot,
              factor: factor!,
              eatenAt: new Date(
                zonedWallToUtc(
                  { year: y, month: m, day: d, hour: hh, minute: mm },
                  p.timezone,
                ).ms,
              ).toISOString(),
              ...(energyEdited ? { kcal } : {}),
              ...(itemsEdited?{items}:{}),
            });
            toast("Comida actualizada");
            onClose();
          }}
        >
          Guardar cambios
        </ActionButton>
      }
    >
      <div className="stack">
        <SourceBadge source={log.source} />
        <Field label="Comida">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {cat&&items.length>0&&!log.stockUsage?.some(u=>u.portions)&&<details><summary>Corregir alimentos y gramos</summary>{items.map((item,n)=><div className="grid g2" key={n}><Field label={`Alimento ${n+1}`}><select value={item.foodId} onChange={e=>changeItem(n,{foodId:e.target.value})}>{cat.foods.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field><Field label={`Gramos del alimento ${n+1}`}><NumInput value={item.grams} onChange={v=>changeItem(n,{grams:v??0})}/></Field></div>)}</details>}
        <div className="grid g2">
          <Field label="Cantidad respecto al registro original">
            <NumInput
              value={factor}
              onChange={setFactor}
              ariaLabel="Cantidad relativa"
            />
            <span className="xs dim">
              0,5 = mitad · 1 = igual · 2 = doble. Ajusta todos los nutrientes.
            </span>
          </Field>
          <Field label="Energía total (kcal)">
            <NumInput
              value={
                energyEdited
                  ? kcal
                  : hasUnknownEnergy(log)
                    ? null
                    : Math.round(revised.kcal * (factor ?? 1))
              }
              onChange={(v) => {
                setKcal(v);
                setEnergyEdited(true);
              }}
              ariaLabel="Calorías de la comida"
            />
          </Field>
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
        <div className="row">
          <ActionButton
            className="btn"
            onRun={async () => {
              await patch("food_logs", log.id, { favorite: !log.favorite });
              toast(
                log.favorite
                  ? "Quitada de favoritas"
                  : "Comida guardada en favoritas",
              );
              onClose();
            }}
          >
            {log.favorite ? "Quitar favorita" : "Guardar favorita"}
          </ActionButton>
          <ActionButton
            className="btn"
            onRun={async () => {
              await repeatMeal(
                log.id,
                localDate(Date.now(), p.timezone),
                new Date().toISOString(),
              );
              toast("Comida repetida hoy");
              onClose();
            }}
          >
            Repetir hoy
          </ActionButton>
        </div>
        {deleting ? (
          <div className="notice warn">
            <p>
              ¿Eliminar esta comida? Se devolverán las cantidades descontadas de
              la despensa.
            </p>
            <ActionButton
              className="btn danger"
              onRun={async () => {
                await deleteFoodLog(log.id);
                toast("Comida eliminada");
                onClose();
              }}
            >
              Confirmar eliminación
            </ActionButton>
            <button className="btn ghost" onClick={() => setDeleting(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button className="text-action" onClick={() => setDeleting(true)}>
            Eliminar registro
          </button>
        )}
      </div>
    </Modal>
  );
}
