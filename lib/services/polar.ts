"use client";
/** Cliente de la integración Polar: el token nunca llega al navegador (cookie httpOnly). */
import { tbl } from "@/lib/db/db";
import { active, nowIso, put } from "@/lib/db/repo";
import { localDate } from "@/lib/domain/time";
import { autoLinkPlanned } from "./training";
import { setConnection } from "./integrations";

export async function polarStatus(): Promise<{ configured: boolean; connected: boolean; connectedAt: string | null } | null> {
  try {
    const r = await fetch("/api/integrations/polar/status", { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function polarSync(tz: string): Promise<{ created: number; skipped: number } | { error: string }> {
  try {
    const r = await fetch("/api/integrations/polar/sync", { method: "POST" });
    const j = await r.json();
    if (!r.ok) {
      await setConnection("polar", { status: "error", lastError: j.error ?? `HTTP ${r.status}` });
      return { error: j.error ?? "Error de Polar" };
    }
    let created = 0;
    let skipped = 0;
    for (const e of j.exercises as { externalId: string; sport: "run" | "bike" | "walk" | "swim" | "other"; startedAt: string; durationSec: number; distanceM: number | null; avgHr: number | null; maxHr: number | null; detail: string | null }[]) {
      if ((await tbl("endurance_sessions").where("externalId").equals(e.externalId).toArray()).some(active)) { skipped++; continue; }
      const rec = await put("endurance_sessions", {
        sport: e.sport, date: localDate(e.startedAt, tz), startedAt: e.startedAt, durationSec: e.durationSec, distanceM: e.distanceM,
        elevationGainM: null, avgHr: e.avgHr, maxHr: e.maxHr, rpe: null, avgPowerW: null, indoor: null, treadmillSpeedKmh: null,
        treadmillInclinePct: null, steps: null, sessionType: null, whileWorking: null, shoeId: null, plannedItemId: null,
        title: e.detail ? `Polar · ${e.detail.toLowerCase().replace(/_/g, " ")}` : "Polar", notes: null, hrZonesSec: null,
        source: "polar", externalId: e.externalId, importId: null,
      });
      if (e.sport === "run" || e.sport === "bike" || e.sport === "walk") await autoLinkPlanned(e.sport, rec.id, "endurance_sessions", rec.date);
      created++;
    }
    await setConnection("polar", { status: "connected", lastSyncAt: nowIso(), lastError: null, scopes: ["accesslink.read_all"] });
    await put("import_jobs", { kind: "polar", fileName: null, status: "ok", created, skipped, errors: [], importedAt: nowIso() });
    return { created, skipped };
  } catch {
    return { error: "Sin conexión. Se intentará cuando vuelva la cobertura." };
  }
}

export async function polarDisconnect() {
  await fetch("/api/integrations/polar/disconnect", { method: "POST" }).catch(() => null);
  await setConnection("polar", { status: "disconnected", lastError: null });
}
