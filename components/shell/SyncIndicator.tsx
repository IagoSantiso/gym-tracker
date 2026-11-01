"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSyncState, subscribeSync, type SyncState } from "@/lib/sync/manager";

const LABEL: Record<SyncState["status"], string> = {
  disabled: "Solo en este dispositivo",
  signed_out: "Sin sesión",
  idle: "Sincronizado",
  syncing: "Sincronizando…",
  offline: "Sin conexión",
  error: "Error de sync",
};

export function SyncIndicator() {
  const [s, setS] = useState<SyncState>(getSyncState());
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    const un = subscribeSync(setS);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
      un();
    };
  }, []);
  const status = !online && s.status !== "disabled" ? "offline" : s.status;
  const pending = s.pending > 0 && status !== "disabled" ? ` · ${s.pending} pendientes` : "";
  return (
    <Link href="/ajustes?tab=sync" className="sync" data-s={status} title={s.error ?? undefined} style={{ textDecoration: "none" }}>
      <i aria-hidden />
      <span>{!online && status === "disabled" ? "Sin conexión · guardado local" : LABEL[status] + pending}</span>
    </Link>
  );
}
