/** Serializa operaciones de generación (plan, menú, propuestas) para evitar carreras entre efectos concurrentes. */
const chains = new Map<string, Promise<unknown>>();
let gate: Promise<void> = Promise.resolve();

export function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const wait = Promise.all([prev.catch(() => undefined), gate]);
  const next = wait.then(fn);
  chains.set(key, next.catch(() => undefined));
  return next;
}

/**
 * Retiene todas las generaciones hasta llamar a la función devuelta. Se usa mientras el
 * dispositivo adopta los datos de la nube, para no generar un plan/menú duplicado a mitad.
 */
export function holdGenerations(): () => void {
  let release!: () => void;
  const p = new Promise<void>((r) => (release = r));
  const prevGate = gate;
  gate = Promise.all([prevGate, p]).then(() => undefined);
  return release;
}
