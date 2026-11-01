type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (ctx) return ctx;
    const C = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Los navegadores móviles solo permiten audio tras un gesto del usuario.
 * Se llama al pulsar una serie / "Iniciar" para que el pitido final suene después.
 */
export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

export function beep(): void {
  try {
    const c = getContext();
    if (c) {
      if (c.state === "suspended") void c.resume().catch(() => {});
      [0, 0.25, 0.5].forEach((t) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, c.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.2);
        o.connect(g).connect(c.destination);
        o.start(c.currentTime + t);
        o.stop(c.currentTime + t + 0.2);
      });
    }
  } catch {
    /* sin audio: no pasa nada */
  }
  vibrate();
}

export function vibrate(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* noop */
  }
}
