"use client";
/** Orquestación de la sincronización en el navegador y estado para el indicador. */
import { onLocalChange } from "@/lib/db/repo";
import { put, nowIso } from "@/lib/db/repo";
import { tbl } from "@/lib/db/db";
import { getSupabase, supabaseAdapter } from "./supabase";
import { pendingCount, syncOnce } from "./engine";

export interface SyncState {
  status: "disabled" | "signed_out" | "idle" | "syncing" | "offline" | "error";
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
  email: string | null;
}

let state: SyncState = { status: "disabled", pending: 0, lastSyncAt: null, error: null, email: null };
const subs = new Set<(s: SyncState) => void>();
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f(state));
};
export const getSyncState = () => state;
export const subscribeSync = (f: (s: SyncState) => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

async function consentOk() {
  return !!(await tbl("consents").get("cloud_sync"))?.granted;
}

export async function syncNow(): Promise<void> {
  const sb = getSupabase();
  set({ pending: await pendingCount() });
  if (!sb) return set({ status: "disabled" });
  const { data } = await sb.auth.getSession();
  if (!data.session) return set({ status: "signed_out", email: null });
  set({ email: data.session.user.email ?? null });
  if (!(await consentOk())) return set({ status: "disabled" });
  if (typeof navigator !== "undefined" && !navigator.onLine) return set({ status: "offline" });
  if (running) return;
  running = true;
  set({ status: "syncing", error: null });
  const startedAt = nowIso();
  try {
    const r = await syncOnce(supabaseAdapter(sb));
    const at = nowIso();
    set({ status: "idle", lastSyncAt: at, pending: await pendingCount() });
    await put("sync_jobs", { startedAt, finishedAt: at, pushed: r.pushed, pulled: r.pulled, error: null });
    // Dispositivo nuevo que acaba de adoptar los datos de la nube: recarga para partir de ellos.
    if (r.first === "adopted" && typeof location !== "undefined") location.reload();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ status: navigator.onLine ? "error" : "offline", error: msg, pending: await pendingCount() });
    await put("sync_jobs", { startedAt, finishedAt: nowIso(), pushed: 0, pulled: 0, error: msg.slice(0, 200) });
  } finally {
    running = false;
  }
}

const schedule = (ms = 4000) => {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
};

export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  onLocalChange(() => {
    void pendingCount().then((n) => set({ pending: n }));
    schedule();
  });
  window.addEventListener("online", () => schedule(500));
  window.addEventListener("offline", () => set({ status: "offline" }));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && schedule(1000));
  setInterval(() => void syncNow(), 120_000);
  getSupabase()?.auth.onAuthStateChange(() => schedule(300));
  schedule(1500);
}
