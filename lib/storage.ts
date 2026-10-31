/** Acceso seguro a localStorage (modo privado, cuota llena, SSR…). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sin espacio o bloqueado: la app sigue funcionando en memoria */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
};

export const KEYS = {
  ui: "gymUI",
  sets: "gymSets",
  loads: "gymLoads",
  logs: "gymLogs",
  timer: "gymTimer",
} as const;
