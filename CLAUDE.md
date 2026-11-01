# CLAUDE.md — convenciones del repositorio (NEXO)

App personal de salud y rendimiento (antes Gym Tracker). Next.js 16 App Router + React 19 + TypeScript estricto + Tailwind 4. PWA local-first (IndexedDB/Dexie) con sync opcional a Supabase. Interfaz en español.

## Comandos
- `npm run dev` · `npm run build` · `npm start`
- `npm test` (Vitest, unit) · `npm run test:e2e` (Playwright contra build de producción) · `npm run typecheck` · `npm run lint`
- `npm run db:sql` regenera `supabase/migrations/*_nexo_schema.sql` desde `lib/db/schema.ts` (no editar el SQL a mano)
- Scripts: `extract-images`, `import-exercises` (free-exercise-db), `generate-icons`, `generate-precache` (automático en `prebuild`)

## Reglas
1. **Seguridad clínica**: nunca generar, sugerir ni calcular dosis/ratios/correcciones de insulina, ni diagnósticos, ni "apto para entrenar". Cualquier texto de IA pasa por `lib/domain/safety/guardrails.ts`. Ver `docs/SAFETY_AND_PRIVACY.md`.
2. **Cálculos críticos** (CGM, nutrición, unidades, cargas, planificación) solo en `lib/domain/**`, puros y con tests en `tests/unit/`.
3. **Esquema**: añadir/cambiar tablas solo en `lib/db/schema.ts` + tipos en `lib/db/types.ts`, y regenerar SQL.
4. **Escrituras** siempre vía `lib/db/repo.ts` (timestamps, borrado lógico, outbox). Nunca `db.table.put` directo en UI.
5. **Procedencia**: todo registro lleva `source` (`manual|measured|imported|calculated|estimated|ai_draft|seed|polar…`) y la UI lo muestra con `<SourceBadge>`.
6. **Secretos** solo en código con `import "server-only"`. Nada sensible en logs.
7. **Offline**: rutas estáticas sin segmentos dinámicos; si añades una ruta, se precachea sola (prebuild escanea `app/**/page.tsx`).
8. **Datos de prueba**: sintéticos (`tests/fixtures`). Nunca datos reales de salud en el repo.
9. Decisiones nuevas → `docs/DECISIONS.md`; estado → `PROJECT_STATUS.md`.
