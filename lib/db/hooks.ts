"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { tbl } from "./db";
import { active } from "./repo";
import { DEFAULT_DIABETES, DEFAULT_GOALS, DEFAULT_PREFERENCES, DEFAULT_PROFILE } from "./defaults";
import type { DiabetesSettings, Goals, Preferences, Profile, Rec, TableName } from "./types";

/** Consulta reactiva; `undefined` mientras carga. */
export function useLive<T>(fn: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  // Dexie detects native async queriers to keep observation across await boundaries.
  // A synchronous () => asyncService() loses reads after the service's first await.
  return useLiveQuery(async () => await fn(), deps);
}

export function useTable<T extends TableName>(table: T, deps: unknown[] = []): Rec<T>[] | undefined {
  return useLiveQuery(async () => ((await tbl(table).toArray()) as Rec<T>[]).filter(active), [table, ...deps]);
}

const withBase = <T,>(d: Omit<T, "createdAt" | "updatedAt">) => ({ ...d, createdAt: "", updatedAt: "" }) as T;

export function useProfile(): Profile {
  return useLiveQuery(() => tbl("profiles").get("me"), []) ?? withBase<Profile>(DEFAULT_PROFILE);
}
export function useGoals(): Goals {
  return useLiveQuery(() => tbl("goals").get("me"), []) ?? withBase<Goals>(DEFAULT_GOALS);
}
export function usePreferences(): Preferences {
  return useLiveQuery(() => tbl("preferences").get("me"), []) ?? withBase<Preferences>(DEFAULT_PREFERENCES);
}
export function useDiabetes(): DiabetesSettings {
  return useLiveQuery(() => tbl("diabetes_settings").get("me"), []) ?? withBase<DiabetesSettings>(DEFAULT_DIABETES);
}
export function useConsent(kind: string): boolean {
  return useLiveQuery(async () => !!(await tbl("consents").get(kind))?.granted, [kind]) ?? false;
}
