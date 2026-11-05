"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ToastProvider } from "@/components/ui";
import { ensureInitialized } from "@/lib/db/init";
import { usePreferences, useProfile } from "@/lib/db/hooks";
import { startSync } from "@/lib/sync/manager";
import { SyncIndicator } from "./SyncIndicator";
import { BreakReminder } from "./BreakReminder";

export const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/", label: "Hoy", short: "Hoy", icon: "home" },
  { href: "/plan", label: "Plan", short: "Plan", icon: "calendar" },
  { href: "/entrenamiento", label: "Entrenamiento", short: "Entreno", icon: "dumbbell" },
  { href: "/nutricion", label: "Comida", short: "Comida", icon: "utensils" },
  { href: "/diabetes", label: "Diabetes", short: "Glucosa", icon: "drop" },
  { href: "/progreso", label: "Evolución", short: "Evolución", icon: "chart" },
  { href: "/asistente", label: "Asistente", short: "IA", icon: "chat" },
  { href: "/ajustes", label: "Ajustes", short: "Ajustes", icon: "settings" },
];
const PRIMARY = [NAV[0], NAV[2], NAV[3], NAV[5]];
const MORE = NAV.filter(n => !PRIMARY.some(p => p.href === n.href));

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

function useTheme() {
  const prefs = usePreferences();
  useEffect(() => {
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      try { localStorage.setItem("nexo-theme", prefs.theme); } catch {}
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0c110e" : "#f6f4ee");
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.theme]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const profile = useProfile();
  useTheme();

  useEffect(() => {
    ensureInitialized()
      .then(() => {
        setReady(true);
        startSync();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => setMoreOpen(false), [path]);
  useEffect(() => {
    if (!moreOpen) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMoreOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="more-sheet"]')?.focus(); } };
    const outside = (e: PointerEvent) => { if (e.target instanceof Element && !e.target.closest('#more-sheet, [aria-controls="more-sheet"]')) setMoreOpen(false); };
    document.addEventListener("keydown",key);
    document.addEventListener("pointerdown",outside);
    return () => { document.removeEventListener("keydown",key); document.removeEventListener("pointerdown",outside); };
  }, [moreOpen]);

  const immersive = path.startsWith("/entrenamiento/sesion") || path.startsWith("/informe");
  const moreActive = MORE.some((n) => isActive(path, n.href));

  return (
    <ToastProvider>
      {ready && <BreakReminder />}
      <div className="app">
        <a href="#main" className="sr-only">Saltar al contenido</a>
        <header className="topbar no-print">
          <div className="in">
            <div className="brand-wrap">
              <Link href="/" className="brand" style={{ textDecoration: "none" }}>
                <i />
                {(profile.appName || "NEXO").toUpperCase()}
              </Link>
              <span id="wake-slot" />
            </div>
            <div className="row"><SyncIndicator /><button className="icon-btn" aria-label="Perfil y herramientas" aria-expanded={moreOpen} aria-controls="more-sheet" onClick={()=>setMoreOpen(v=>!v)}><Icon name="settings"/></button></div>
          </div>
        </header>
        <div className="layout">
          <nav className="side" aria-label="Secciones">
            {PRIMARY.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
              </Link>
            ))}
          </nav>
          <main id="main" className="page">
            <div className="app-wrap" style={{ paddingBottom: immersive ? 160 : undefined }}>
              {error ? (
                <div className="card" style={{ marginTop: 24 }}>
                  <h3>No se pudo abrir la base de datos local</h3>
                  <p className="muted small">{error}. Si estás en modo privado, el navegador puede bloquear IndexedDB.</p>
                </div>
              ) : ready ? (
                children
              ) : (
                <div className="empty-state" aria-busy="true">Cargando…</div>
              )}
            </div>
          </main>
        </div>
        {!immersive && (
          <>
            <nav className="nav" aria-label="Secciones principales">
              {PRIMARY.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}>
                  <Icon name={n.icon} />
                  {n.short}
                </Link>
              ))}

            </nav>
            {moreOpen && (
              <div className="more-sheet" id="more-sheet" aria-label="Más secciones">
                {MORE.filter(n=>n.href!=="/plan").map((n) => (
                  <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}>
                    <Icon name={n.icon} />
                    {n.label}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ToastProvider>
  );
}
