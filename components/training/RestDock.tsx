"use client";

import { useEffect, useRef } from "react";

interface Props {
  base: number;
  secs: number;
  running: boolean;
  paused: boolean;
  flash: number;
  onToggle: () => void;
  onAdjust: (delta: number) => void;
  onReset: () => void;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function RestDock({ base, secs, running, paused, flash, onToggle, onAdjust, onReset }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Relanza la animación de destello cada vez que termina un descanso
  useEffect(() => {
    if (!flash || !ref.current) return;
    const el = ref.current;
    el.classList.remove("end");
    void el.offsetWidth;
    el.classList.add("end");
  }, [flash]);

  const label = running ? "Pausar" : paused ? "Seguir" : "Iniciar";

  return (
    <div className={`dock ${running ? "run" : ""}`} ref={ref}>
      <div className="t">
        <small>DESCANSO</small>
        <strong role="timer" aria-live="off">{fmt(secs)}</strong>
      </div>
      <div className="ctl">
        <button aria-label="Restar 15 segundos" onClick={() => onAdjust(-15)}>−15</button>
        <button className="go" onClick={onToggle}>{label}</button>
        <button aria-label="Sumar 15 segundos" onClick={() => onAdjust(15)}>+15</button>
        <button aria-label="Reiniciar" onClick={onReset}>↺</button>
      </div>
      <i className="ring" style={{ width: `${base ? (1 - secs / base) * 100 : 0}%` }} />
    </div>
  );
}
