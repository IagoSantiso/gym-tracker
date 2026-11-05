import type { MealSlot } from "@/lib/db/types";
/** Local wall-clock defaults; automatic entries remain assumptions, never measurements. */
export const MEAL_HOURS: Record<MealSlot, number> = {breakfast:8,pre:11,lunch:14,snack:17,post:19,dinner:21};
export function mealIsDue(slot:MealSlot,hour:number){return hour>=MEAL_HOURS[slot];}
