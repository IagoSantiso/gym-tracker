# Arquitectura

## Auditoría del punto de partida (2026-11-01)
| Aspecto | Estado encontrado |
| --- | --- |
| Repositorio | Rama `claude/gym-tracker-pwa-migration-0v1inn`, árbol limpio. Punto de restauración: tag `restore/pre-nexo` (commit `4e7ee9b`). |
| App | Gym Tracker migrado a Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. PWA con service worker propio, manifest e iconos. |
| Datos | `localStorage` (`gymUI`, `gymSets`, `gymLoads`, `gymLogs`). Sin backend, sin auth, sin tests. |
| Reutilizable | Biblioteca de 18 ejercicios con 36 fotos reales (free-exercise-db, dominio público), mapa muscular SVG, tarjeta de ejercicio, temporizador por hora de fin, Wake Lock, SW offline, scripts de extracción e iconos. |
| Deuda | Estado en un único componente; sin modelo de dominio; datos no tipados por sesión/serie. |
| Docs previas | `README.md`, prompt de fases del gimnasio (`docs/prompts/PROMPT_FASES_GYM.md`). No había AGENTS.md ni `.env.example`. |

Decisión: **evolucionar** sobre la base existente (no reescribir). Ver `DECISIONS.md`.

## Vista general
```
┌──────────────────────── Navegador / PWA instalada ────────────────────────┐
│  UI (App Router, componentes cliente)                                      │
│   ├─ app/(rutas): /  /plan  /entrenamiento  /nutricion  /diabetes ...      │
│   └─ components/ (shell, charts SVG, formularios, tarjeta de ejercicio)    │
│  Dominio puro y determinista (lib/domain/*) — testeado con Vitest          │
│   cgm · nutrition · training · planning · review · units · time · safety   │
│  Datos local-first (lib/db) — IndexedDB vía Dexie                           │
│   esquema único (lib/db/schema.ts) → stores Dexie + SQL + whitelist sync   │
│  Sync opcional (lib/sync) — outbox + pull incremental → Supabase           │
│  Herramientas IA (lib/ai/client-tools) — se ejecutan AQUÍ, sobre IndexedDB │
│  Service worker (public/sw.js) — precache de rutas, chunks y fotos         │
└───────────────┬───────────────────────────────┬────────────────────────────┘
                │ HTTPS (JWT Supabase)           │ HTTPS
┌───────────────▼──────────────┐   ┌────────────▼─────────────────────────────┐
│ Supabase (opcional)          │   │ Route handlers Next (Vercel, servidor)    │
│  Postgres + RLS por user_id  │   │  /api/ai/chat  → Claude (u OpenAI)        │
│  Auth magic link             │   │     guardarraíles · validación · límites  │
└──────────────────────────────┘   │  /api/integrations/polar/* → AccessLink   │
                                   │     OAuth2 · token cifrado (cookie httpOnly)│
                                   └───────────────────────────────────────────┘
```

## Capas y reglas
1. **Dominio (`lib/domain/**`)**: funciones puras sin React ni IndexedDB. Todo cálculo crítico vive aquí y tiene tests.
2. **Datos (`lib/db/**`)**: `schema.ts` es la fuente de verdad de tablas y columnas. `repo.ts` aplica `id`, `createdAt`, `updatedAt`, borrado lógico (`deletedAt`) y encola cambios en el outbox.
3. **Sync (`lib/sync/**`)**: motor independiente del proveedor (`RemoteAdapter`). Push por orden de dependencias, pull por `server_updated_at`, última escritura gana (por `updatedAt`). Supabase es un adaptador.
4. **Servidor (`app/api/**`)**: solo lo que no puede hacer el cliente: llamadas a IA con claves secretas y OAuth de Polar. Sin acceso a la base de datos del usuario; no persiste contenido sensible ni lo registra en logs.
5. **UI (`app/**`, `components/**`)**: componentes cliente con `useLiveQuery`. Sin lógica de negocio crítica en componentes.

## Offline
- Todas las rutas son estáticas (prerender) y se precachean en la instalación del SW junto con sus chunks y las fotos.
- Navegaciones: stale-while-revalidate por ruta. Peticiones RSC: solo red; si fallan, Next hace navegación completa y el SW sirve la página cacheada.
- Escrituras: siempre en IndexedDB primero; el outbox se sincroniza al volver la conexión.
- IA e integraciones degradan con mensajes claros; el registro manual nunca depende de ellas.

## Seguridad (resumen; detalle en SAFETY_AND_PRIVACY.md)
- Claves (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `POLAR_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`) solo en servidor (`import "server-only"`).
- `/api/*` exige sesión Supabase válida y email en `ALLOWED_EMAILS`; sin Supabase, la IA queda desactivada salvo `AI_ALLOW_ANONYMOUS=true` (solo local).
- Cabeceras de seguridad (CSP, frame-ancestors, referrer-policy) en `next.config.ts`.

## Rendimiento
- Gráficas SVG propias (sin librería pesada), import dinámico de `pdfjs-dist` solo al importar PDF.
- Lecturas CGM indexadas por `ts`; métricas sobre ventanas acotadas.

## Despliegue
Vercel (build `next build`). Variables en `.env.example`. Supabase opcional: migraciones en `supabase/migrations/`.
