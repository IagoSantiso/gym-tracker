"use client";
/** Recordatorio de pausa activa mientras la app está abierta (sin notificaciones push en v1). */
import { useEffect } from "react";
import { useToast } from "@/components/ui";
import { usePreferences } from "@/lib/db/hooks";

export function BreakReminder() {
  const prefs = usePreferences();
  const toast = useToast();
  useEffect(() => {
    const min = prefs.activeBreakReminderMin;
    if (!min || min < 15) return;
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      toast("Pausa activa: 5 min de caminata o movilidad, si te viene bien");
      try { navigator.vibrate?.(150); } catch { /* */ }
    }, min * 60000);
    return () => clearInterval(iv);
  }, [prefs.activeBreakReminderMin, toast]);
  return null;
}
