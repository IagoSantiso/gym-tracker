"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ExerciseCard } from "./ExerciseCard";
import { RestDock } from "./RestDock";
import { useGymState } from "@/hooks/useGymState";
import { useRestTimer } from "@/hooks/useRestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { beep, unlockAudio, vibrate } from "@/lib/audio";
import { EXERCISES, PLANS } from "@/lib/plan";
import { doneSetsOf, exerciseKey, formatLogDate, isExerciseDone, setsFor, weekStart } from "@/lib/plan-utils";
import type { PlanMode } from "@/lib/types";

const NO_SETS: readonly boolean[] = [];

export function GymApp() {
  const g = useGymState();
  const { mode, day, adapt } = g.ui;
  const plan = PLANS[mode];
  const current = plan[day] ?? plan[0];

  /* ---- Toast ---- */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  /* ---- Temporizador de descanso ---- */
  const timer = useRestTimer(
    useCallback(
      ({ late }: { late: boolean }) => {
        if (late) {
          vibrate();
          showToast("Descanso terminado");
        } else {
          beep();
          showToast("¡A por la siguiente serie!");
        }
      },
      [showToast],
    ),
  );
  const startRest = timer.start;
  const handleSetDone = useCallback(
    (rest: number) => {
      unlockAudio(); // gesto del usuario: permite que el pitido suene luego
      startRest(rest);
    },
    [startRest],
  );

  /* ---- Pantalla encendida durante la sesión ---- */
  const sessionActive = useMemo(
    () => timer.running || Object.values(g.sets).some((a) => a.some(Boolean)),
    [timer.running, g.sets],
  );
  const screenOn = useWakeLock(sessionActive);

  /* ---- Derivados ---- */
  const keys = useMemo(() => current.items.map((e) => exerciseKey(e, mode, day)), [current, mode, day]);
  const totalSets = current.items.reduce((a, e) => a + setsFor(e, adapt), 0);
  const doneSets = current.items.reduce((a, e, i) => a + doneSetsOf(e, keys[i], g.sets, adapt), 0);
  const doneExercises = current.items.filter((e, i) => isExerciseDone(e, keys[i], g.sets, adapt)).length;
  const ws = weekStart();

  /* ---- Acciones ---- */
  const saveSession = () => {
    const count = doneExercises;
    const vol = doneSets;
    if (!vol) {
      showToast("Marca al menos una serie");
      return;
    }
    g.addLog({ date: formatLogDate(), ts: Date.now(), title: `${current.title} (${mode} días)`, count, vol });
    g.clearSets(keys);
    showToast("Sesión guardada 💪");
  };

  const pickDay = (i: number) => {
    g.setDay(i);
    document.querySelector(".session-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Al cambiar de modo, el día vuelve a 0
  const pickMode = (m: PlanMode) => g.setMode(m);

  return (
    <>
      <header className="topbar">
        <div className="in">
          <div className="brand-wrap">
            <div className="brand"><i />GYM TRACKER</div>
            {screenOn && <span className="wl" title="La pantalla no se apagará durante la sesión"><i />Pantalla activa</span>}
          </div>
          <div className="seg" role="group" aria-label="Frecuencia semanal">
            <button className={mode === 2 ? "on" : ""} onClick={() => pickMode(2)}>2 días</button>
            <button className={mode === 3 ? "on" : ""} onClick={() => pickMode(3)}>3 días</button>
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div className="eyebrow">Vuelta progresiva · fuerza</div>
          <h1>Cada músculo,<br /><em>una vez por semana.</em></h1>
          <p>Rutina de 2 o 3 días con fotos reales de cada ejercicio, mapa muscular y registro de cargas. Sesiones de unos 60 minutos.</p>
          <div className="stats">
            <div className="stat"><b>{g.logs.length}</b><small>sesiones guardadas</small></div>
            <div className="stat"><b>{g.logs.filter((l) => l.ts && l.ts >= ws).length}</b><small>esta semana</small></div>
            <div className="stat"><b>{g.logs.reduce((a, l) => a + (l.count || 0), 0)}</b><small>ejercicios hechos</small></div>
            <div className="stat"><b>60′</b><small>objetivo por sesión</small></div>
          </div>
        </section>

        <div className="sec-head"><h2>Tu semana</h2><span className="pill">PLAN DE {mode} DÍAS</span></div>
        <nav className={`days n${mode}`}>
          {plan.map((d, i) => {
            const tot = d.items.reduce((a, e) => a + setsFor(e, adapt), 0);
            const dn = d.items.reduce((a, e) => a + doneSetsOf(e, exerciseKey(e, mode, i), g.sets, adapt), 0);
            return (
              <button key={`${mode}-${i}`} className={`day ${i === day ? "on" : ""}`} onClick={() => pickDay(i)}>
                <span className="n">DÍA {String(i + 1).padStart(2, "0")}</span>
                <strong>{d.title}</strong>
                <small>{d.items.length} ejercicios · {tot} series</small>
                <div className="mini">
                  {d.subtitle.split(" · ").slice(0, 3).map((t) => <span key={t}>{t}</span>)}
                </div>
                <i className="bar" style={{ width: `${tot ? (dn / tot) * 100 : 0}%` }} />
              </button>
            );
          })}
        </nav>

        <section style={{ marginTop: 30 }}>
          <div className="session-top">
            <div>
              <div className="eyebrow">Día {day + 1} de {mode}</div>
              <h2>{current.title}</h2>
              <div className="sub">{current.subtitle} · {current.items.length} ejercicios · {current.time}</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={adapt} onChange={(e) => g.setAdapt(e.target.checked)} />
              <span>Adaptación: 2 series<br /><span style={{ color: "var(--dim)", fontSize: 11 }}>primeras 2 semanas</span></span>
            </label>
          </div>
          <div className="prog">
            <div className="track"><i style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} /></div>
            <span>{doneSets}/{totalSets} series · {doneExercises}/{current.items.length} ejercicios</span>
          </div>

          <div>
            {current.items.map((item, i) => {
              const k = keys[i];
              const load = g.loads[k];
              return (
                <ExerciseCard
                  key={k}
                  index={i}
                  item={item}
                  info={EXERCISES[item.id]}
                  k={k}
                  n={setsFor(item, adapt)}
                  done={g.sets[k] ?? NO_SETS}
                  weight={load?.weight ?? ""}
                  reps={load?.reps ?? ""}
                  onToggleSet={g.toggleSet}
                  onSetAll={g.setAllSets}
                  onLoad={g.setLoad}
                  onSetDone={handleSetDone}
                />
              );
            })}
          </div>
        </section>

        <div className="actions">
          <button className="btn primary" onClick={saveSession}>Guardar sesión</button>
          <button className="btn ghost" onClick={() => g.clearSets(keys)}>Desmarcar series</button>
        </div>

        <div className="sec-head"><h2>Historial</h2><span className="pill">{g.logs.length ? `${g.logs.length} SESIONES` : "VACÍO"}</span></div>
        <section className="history">
          {g.logs.length ? (
            g.logs.slice().reverse().slice(0, 10).map((l, i) => (
              <div className="h-item" key={`${l.ts}-${i}`}>
                <span><b>{l.title}</b> · {l.date}</span>
                <em>{l.count} ejercicios{l.vol ? ` · ${l.vol} series` : ""}</em>
              </div>
            ))
          ) : (
            <div className="empty">Todavía no has guardado ninguna sesión.</div>
          )}
        </section>

        <div className="notes">
          <div className="note"><b>Cómo usarlo</b>Elige 2 o 3 días y abre el que toque. Pulsa cada número de serie al terminarla: se marca y arranca el descanso. Apunta peso y repeticiones; se recuerdan para la próxima vez. Todo se guarda solo en este dispositivo.</div>
          <div className="note"><b>Vuelta progresiva</b>Las 2 primeras semanas activa “Adaptación” (2 series) y deja 3–4 repeticiones en recámara. Después usa las series indicadas con 1–3 en recámara. Calienta 5–8 min y haz 1–3 series de aproximación en el primer ejercicio pesado.</div>
        </div>
        <p className="credit">
          Fotos de ejercicios: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (dominio público).<br />
          Gym Tracker v3 · funciona sin conexión una vez instalada
        </p>
      </main>

      <RestDock
        base={timer.base}
        secs={timer.secs}
        running={timer.running}
        paused={timer.paused}
        flash={timer.flash}
        onToggle={() => { unlockAudio(); timer.toggle(); }}
        onAdjust={timer.adjust}
        onReset={timer.reset}
      />
      <div className={`toast ${toast ? "on" : ""}`} role="status">{toast}</div>
    </>
  );
}
