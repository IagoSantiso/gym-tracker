"use client";
/** Componentes de UI reutilizables (accesibles, táctiles ≥ 40 px). */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { Source } from "@/lib/db/types";

export { Icon };

export function PageHead({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pg-head">
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="row no-print">{actions}</div>}
      </div>
      {children && <p>{children}</p>}
    </header>
  );
}

export function Section({ title, right, children, id }: { title: string; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section style={{ marginTop: 22 }} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="sec-head" style={{ margin: "0 0 10px" }}>
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "", title, sub, right }: { children?: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="row between" style={{ marginBottom: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

const SOURCE_LABEL: Record<Source, string> = {
  manual: "Manual", measured: "Medido", imported: "Importado", calculated: "Calculado", estimated: "Estimado",
  ai_draft: "Borrador IA", rules: "Reglas", seed: "Base", polar: "Polar",
};
const SOURCE_HELP: Record<Source, string> = {
  manual: "Introducido por ti", measured: "Medido por un dispositivo", imported: "Importado de un archivo",
  calculated: "Calculado por la app de forma determinista", estimated: "Estimación con margen de error",
  ai_draft: "Propuesta de la IA pendiente de tu aprobación", rules: "Generado por reglas transparentes",
  seed: "Dato de referencia de la app", polar: "Sincronizado desde Polar",
};

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className={`badge src-${source}`} title={SOURCE_HELP[source]}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function Notice({ kind = "info", children, icon }: { kind?: "info" | "warn" | "danger"; children: ReactNode; icon?: IconName }) {
  return (
    <div className={`notice ${kind}`} role={kind === "danger" ? "alert" : "note"}>
      <Icon name={icon ?? (kind === "info" ? "info" : "alert")} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <b>{title}</b>
      {children}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Input numérico que acepta coma decimal y devuelve number | null. */
export function NumInput({
  value, onChange, step = "any", min, max, placeholder, ariaLabel, inputMode = "decimal", className = "input",
}: {
  value: number | null | undefined; onChange: (v: number | null) => void; step?: string; min?: number; max?: number;
  placeholder?: string; ariaLabel?: string; inputMode?: "decimal" | "numeric"; className?: string;
}) {
  const [txt, setTxt] = useState(value == null ? "" : String(value).replace(".", ","));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setTxt(value == null ? "" : String(value).replace(".", ","));
    }
  }, [value]);
  return (
    <input
      className={className} type="text" inputMode={inputMode} value={txt} placeholder={placeholder} aria-label={ariaLabel}
      data-step={step}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, "");
        setTxt(t);
        const n = t === "" ? null : Number(t.replace(",", "."));
        if (n === null || Number.isFinite(n)) {
          const clamped = n == null ? null : Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
          last.current = clamped;
          onChange(clamped);
        }
      }}
    />
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch" style={{ justifyContent: "space-between" }}>
      <span style={{ color: "var(--text)" }}>
        {label}
        {hint && <><br /><span className="xs dim">{hint}</span></>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Pestañas sincronizadas con ?tab= (rutas estáticas, sin segmentos dinámicos). */
export function useTabParam<T extends string>(def: T, allowed: readonly T[]): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(def);
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("tab") as T | null;
    if (p && allowed.includes(p)) setTab(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = useCallback((t: T) => {
    setTab(t);
    const url = new URL(location.href);
    url.searchParams.set("tab", t);
    history.replaceState(history.state, "", url);
  }, []);
  return [tab, change];
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={id} onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <div className="mh">
            <h2 id={id}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
          </div>
          <div className="mb">{children}</div>
          {footer && <div className="mf">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function Kpi({ value, label, source }: { value: ReactNode; label: ReactNode; source?: Source }) {
  return (
    <div className="kpi">
      <b>{value}</b>
      <small>{label}</small>
      {source && <div style={{ marginTop: 4 }}><SourceBadge source={source} /></div>}
    </div>
  );
}

export function Bar({ value, max, label, color }: { value: number; max: number; label: string; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-track" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-label={label}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/* ───────── Toasts ───────── */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const show = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((i) => <div key={i.id}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/** Confirmación nativa para acciones irreversibles. */
export const confirmAction = (msg: string) => typeof window !== "undefined" && window.confirm(msg);
