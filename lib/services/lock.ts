/** Serializa operaciones de generación (plan, menú, propuestas) para evitar carreras entre efectos concurrentes. */
const chains = new Map<string, Promise<unknown>>();

export function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(key, next.catch(() => undefined));
  return next;
}
