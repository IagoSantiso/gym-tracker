"use client";
/** Campos que guardan directamente en un singleton (perfil, objetivos…) al cambiar/salir. */
import { useEffect, useState } from "react";
import { Field, NumInput } from "@/components/ui";
import { patch } from "@/lib/db/repo";
import type { TableName } from "@/lib/db/types";

type Singleton = "profiles" | "goals" | "preferences" | "diabetes_settings";

export function TextF({ table, field, value, label, hint, placeholder, multiline, type = "text" }: { table: Singleton; field: string; value: string | null | undefined; label: string; hint?: string; placeholder?: string; multiline?: boolean; type?: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const save = () => {
    const nv = v.trim() === "" ? null : v;
    if (nv !== (value ?? null)) void patch(table as TableName, "me", { [field]: nv } as never);
  };
  return (
    <Field label={label} hint={hint}>
      {multiline ? <textarea value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={save} />
        : <input type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />}
    </Field>
  );
}

export function NumF({ table, field, value, label, hint, min, max }: { table: Singleton; field: string; value: number | null | undefined; label: string; hint?: string; min?: number; max?: number }) {
  return (
    <Field label={label} hint={hint}>
      <NumInput value={value ?? null} min={min} max={max} ariaLabel={label} onChange={(n) => void patch(table as TableName, "me", { [field]: n } as never)} />
    </Field>
  );
}

export function SelectF<T extends string>({ table, field, value, label, options, hint }: { table: Singleton; field: string; value: T | null | undefined; label: string; options: { v: T | ""; l: string }[]; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value ?? ""} onChange={(e) => void patch(table as TableName, "me", { [field]: e.target.value === "" ? null : e.target.value } as never)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </Field>
  );
}

export function ChipsF({ table, field, value, options }: { table: Singleton; field: string; value: string[]; options: { id: string; label: string }[] }) {
  return (
    <div className="pill-row">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} className="chip" aria-pressed={on} onClick={() => void patch(table as TableName, "me", { [field]: on ? value.filter((x) => x !== o.id) : [...value, o.id] } as never)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ListF({ table, field, value, label, hint }: { table: Singleton; field: string; value: string[]; label: string; hint?: string }) {
  const [v, setV] = useState(value.join(", "));
  useEffect(() => setV(value.join(", ")), [value]);
  return (
    <Field label={label} hint={hint ?? "Separados por comas"}>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => void patch(table as TableName, "me", { [field]: v.split(",").map((s) => s.trim()).filter(Boolean) } as never)} />
    </Field>
  );
}
