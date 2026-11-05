import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDB, setDbForTests, tbl } from "@/lib/db/db";
import { ensureInitialized, resetInitForTests } from "@/lib/db/init";
import { put, patch } from "@/lib/db/repo";
import { energyDay } from "@/lib/domain/nutrition/energy";
import {
  dailyBudget,
  hasUnknownEnergy,
  diarySignature,
} from "@/lib/domain/nutrition/diary";
import { confirmDiary, editMeal, repeatMeal } from "@/lib/services/diary";
import { logManualMeal, logFreeMeal } from "@/lib/services/nutrition";
import { deleteFoodLog } from "@/lib/services/kitchen";
import { loadDayBalance } from "@/lib/services/balance";
import { logStrengthExercise } from "@/lib/services/training";
import { localDate } from "@/lib/domain/time";
let db: NexoDB;
const date = localDate();
beforeEach(async () => {
  db = new NexoDB(`diary-${crypto.randomUUID()}`);
  setDbForTests(db);
  resetInitForTests();
  await db.open();
  await ensureInitialized();
});
afterEach(async () => {
  await db.delete();
  setDbForTests(null);
});
const meal = () =>
  logManualMeal({
    date,
    slot: "lunch",
    title: "Comida sintética",
    kcal: 600,
    carbsG: 60,
    proteinG: 20,
  });
describe("daily core", () => {
  it("uses the agreed intake target even when activity changes", () => {
    const input = {
      weightKg: 80,
      bmrMid: 1800,
      steps: 0,
      exercise: [],
      intakeKcal: 2000,
      plannedRestKcal: 0,
      targetDeficit: 500,
      targetIntake: [2000, 2000] as [number, number],
      dayClosed: true,
    };
    const rest = energyDay(input),
      active = energyDay({
        ...input,
        exercise: [{ label: "Sesión", kcal: 300 }],
      });
    expect(rest.verdict).toBe("on_track");
    expect(active.verdict).toBe("on_track");
    expect(active.targetBalance).toBe(rest.targetBalance - 300);
  });
  it("never interprets an incomplete day as achieved deficit", () => {
    expect(dailyBudget(600, [1900, 2100], 1, false, false, 2400)).toMatchObject(
      { balance: null, remaining: [1300, 1500] },
    );
    expect(
      dailyBudget(600, [1900, 2100], 1, true, true, 2400).balance,
    ).toBeNull();
    expect(dailyBudget(2000, [1900, 2100], 3, false, true, 2400).balance).toBe(
      -400,
    );
  });
  it("does not replace a whole planned meal when logging a partial item", async () => {
    const plan = await put("meal_entries", {
      date,
      slot: "lunch",
      mealPlanId: "synthetic",
      recipeId: "salmon-patata-judias",
      servings: 1,
      locked: false,
      status: "planned",
    });
    await meal();
    expect((await tbl("meal_entries").get(plan.id))?.status).toBe("planned");
    expect(
      (await loadDayBalance(date)).remaining.some((m) => m.id === plan.id),
    ).toBe(true);
  });
  it("confirmation follows content, survives a favorite toggle and invalidates on edit/delete", async () => {
    const l = await meal();
    await confirmDiary(date, true);
    expect((await loadDayBalance(date)).confirmed).toBe(true);
    await patch("food_logs", l.id, { favorite: true });
    expect((await loadDayBalance(date)).confirmed).toBe(true);
    await editMeal(l.id, {
      title: l.title,
      date,
      eatenAt: l.eatenAt,
      slot: l.slot,
      factor: 0.5,
    });
    expect((await loadDayBalance(date)).confirmed).toBe(false);
    expect((await tbl("food_logs").get(l.id))?.totals.kcal).toBe(300);
    await confirmDiary(date, true);
    await deleteFoodLog(l.id);
    expect((await loadDayBalance(date)).confirmed).toBe(false);
  });
  it("keeps unknown energy distinct from zero", async () => {
    const l = await logManualMeal({
      date,
      slot: "lunch",
      title: "Sin energía",
      kcal: null,
      carbsG: 30,
      proteinG: null,
    });
    expect(hasUnknownEnergy(l)).toBe(true);
    await confirmDiary(date, true);
    expect((await loadDayBalance(date)).budget.balance).toBeNull();
  });
  it("confirmation survives JSON key reordering from cloud storage", async () => {
    const l = await meal();
    const copy = {
      ...l,
      totals: Object.fromEntries(
        Object.entries(l.totals).reverse(),
      ) as typeof l.totals,
    };
    expect(diarySignature([l])).toBe(diarySignature([copy]));
  });
  it("repetition creates an independent snapshot without a planned link", async () => {
    const l = await meal();
    await patch("food_logs", l.id, { favorite: true });
    const copy = await repeatMeal(
      l.id,
      date,
      new Date().toISOString(),
      "dinner",
    );
    expect(copy.id).not.toBe(l.id);
    expect(copy.slot).toBe("dinner");
    expect(copy.mealEntryId).toBeNull();
    expect(copy.favorite).toBe(false);
  });
  it("quantity edits adjust pantry once and roll back on invalid input", async () => {
    const stock = await put("pantry_items", {
      foodId: "egg",
      name: "Huevos sintéticos",
      grams: 500,
    });
    const l = await logFreeMeal({
      date,
      slot: "lunch",
      title: "Huevos",
      items: [{ foodId: "egg", grams: 100 }],
    });
    expect((await tbl("pantry_items").get(stock.id))?.grams).toBe(400);
    await editMeal(l.id, {
      title: l.title,
      date,
      eatenAt: l.eatenAt,
      slot: l.slot,
      factor: 2,
    });
    expect((await tbl("pantry_items").get(stock.id))?.grams).toBe(300);
    await expect(
      editMeal(l.id, {
        title: l.title,
        date,
        eatenAt: l.eatenAt,
        slot: l.slot,
        factor: -1,
      }),
    ).rejects.toThrow();
    expect((await tbl("pantry_items").get(stock.id))?.grams).toBe(300);
  });
  it("stores timed holds without fabricating repetitions", async () => {
    await logStrengthExercise({
      requestId: "timed",
      date,
      startedAt: new Date().toISOString(),
      exerciseId: "crunch",
      sets: 3,
      reps: 0,
      seconds: 30,
      weightKg: null,
      durationMin: null,
    });
    const sets = await tbl("exercise_sets")
      .where("sessionId")
      .equals("timed")
      .toArray();
    expect(sets).toHaveLength(3);
    expect(sets[0].durationSec).toBe(30);
    expect(sets[0].reps).toBeNull();
  });
});

it("recalculates changed foods and quantities instead of only renaming the meal",async()=>{
 const log=await logFreeMeal({date,slot:"lunch",title:"Huevo sintético",items:[{foodId:"egg",grams:100}]});
 await editMeal(log.id,{title:log.title,date,eatenAt:log.eatenAt,slot:log.slot,factor:1,items:[{foodId:"egg",grams:200}]});
 const edited=await tbl("food_logs").get(log.id);
 expect(edited?.totals.kcal).toBeCloseTo(log.totals.kcal*2);
 expect(edited?.items[0].grams).toBe(200);
});
it("concurrent delete returns pantry consumption only once",async()=>{
 const stock=await put("pantry_items",{foodId:"egg",name:"Huevos",grams:500});
 const log=await logFreeMeal({date,slot:"lunch",title:"Huevo sintético",items:[{foodId:"egg",grams:100}]});
 await Promise.all([deleteFoodLog(log.id),deleteFoodLog(log.id)]);
 expect((await tbl("pantry_items").get(stock.id))?.grams).toBe(500);
});
