# Modelo de datos

**Fuente de verdad:** `lib/db/schema.ts`. De ese único registro se derivan (1) los stores e índices de IndexedDB (Dexie), (2) la migración SQL de Supabase (`npm run db:sql` → `supabase/migrations/*_nexo_schema.sql`) y (3) la lista blanca de columnas que sincroniza el cliente. Un test (`tests/unit/sql-schema.test.ts`) aplica la migración en PGlite y verifica RLS entre usuarios.

## Convenciones
- **IDs** `text` estables: UUID v4 para registros del usuario; ids legibles para semillas (`bench`, `ppl-3d`) y singletons (`me`). Clave primaria en servidor: `(user_id, id)`; las FKs son compuestas `(user_id, x_id)` → imposible relacionar datos de dos usuarios.
- **Tiempo**: instantes en UTC ISO-8601 (`timestamptz`); fechas de calendario como `date` (`YYYY-MM-DD`) en la zona del perfil (`Europe/Madrid` por defecto). Las lecturas CGM guardan también la hora local original (`localTime`) y la zona usada al convertir.
- **Unidades explícitas en el nombre**: `weightKg`, `distanceM`, `durationSec`, `valueMgdl`, `carbsAvailableG`… La glucosa se guarda en mg/dL **y** se conserva el valor y unidad originales (`originalValue`, `originalUnit`).
- **Procedencia** (`source`): `manual` · `measured` (sensor/dispositivo) · `imported` (archivo) · `calculated` · `estimated` · `ai_draft` · `seed` · `polar` …, más `importId`/`externalId` para trazar el origen y deduplicar.
- **Auditoría de cambios**: `createdAt`, `updatedAt` (cliente) y `server_updated_at` (servidor, cursor de sync). **Borrado lógico** (`deletedAt`) en tablas sincronizadas para propagar borrados; el "borrar todos mis datos" es borrado físico.
- **Datos originales inmutables**: los archivos importados se guardan cifrados en `raw_files` (solo local, AES-GCM con clave no exportable) y pueden borrarse tras el procesado; las lecturas derivadas guardan `importId` y `parserVersion`.

## Tablas (agrupadas por dominio)
| Dominio | Tabla | Contenido clave |
| --- | --- | --- |
| Perfil | `profiles` (singleton) | nombre visible, fecha nacimiento (opcional), sexo (opcional, solo para ecuaciones), altura, zona horaria, locale, experiencia, equipamiento, disponibilidad semanal, referencia de carrera, FC, pasos |
| | `goals` (singleton) | objetivo principal, ritmo de pérdida (%/semana, con límites), objetivo manual acordado con profesional (kcal/macros + fuente), objetivo de carrera |
| | `preferences` (singleton) | comidas/día, alergias, intolerancias, excluidos, tiempo de cocina, presupuesto, tema, progresión automática, descarga, recordatorios |
| | `consents` | una fila por permiso (`ai_assistant`, `ai_cgm`, `ai_nutrition`, `ai_training`, `ai_notes`, `cloud_sync`, `polar`), con fecha de concesión/revocación y versión del texto |
| | `diabetes_settings` (singleton) | dispositivo CGM, unidad, tratamiento descrito por el usuario (texto), rangos objetivo **de su equipo** con fuente y fecha, hipoglucemia inadvertida (opcional), protocolo personal (texto + fuente) |
| Cuerpo y hábitos | `weight_entries`, `body_measurements`, `recovery_checkins`, `habit_entries`, `user_notes` | peso, perímetros, sueño/energía/fatiga/dolor/estrés/hambre, hábitos de experimentos, notas |
| Entrenamiento | `exercises` (personalizados; la biblioteca base está en código) | músculos, equipo, patrón, dificultad, instrucciones, errores, variantes, contraindicaciones generales |
| | `workout_templates` | rutinas (agregado: días → ejercicios con series, rango de reps, RIR, descanso, tempo, notas) |
| | `workout_sessions` → `exercise_sets` | sesión real y cada serie (peso, reps, RIR, completada, calentamiento) |
| | `endurance_sessions`, `shoes`, `activity_streams` (local) | carrera/bici/caminata/cinta/movilidad con FC, RPE, potencia solo si hay sensor, calzado; muestras de TCX/GPX en local |
| | `daily_activity`, `sleep_records` | pasos y sueño (manual, CSV o Polar) |
| Planificación | `plan_weeks` | instantánea del plan **original** de la semana |
| | `planned_items` | plan **vigente** (estado: planificado/hecho/modificado/cancelado/movido, bloqueo, enlace a la actividad **real**) |
| | `proposals` | cambios sugeridos (reglas o IA) con motivos, datos usados, supuestos, confianza, payload y su inverso; estado aceptado/rechazado + motivo |
| Nutrición | `food_sources`, `foods` | fuente/licencia/versión/fecha; valores por 100 g con hidratos **disponibles y totales** diferenciados, estado crudo/cocinado, factor de rendimiento |
| | `recipes` → `recipe_ingredients`, `recipe_prefs` | recetas propias (las semilla viven en código), favoritas, lista negra, último uso |
| | `meal_plans` → `meal_entries` | menú semanal y cada comida prevista (bloqueo, estado, sustitución) |
| | `food_logs` | lo comido realmente, con instantánea de nutrientes calculados |
| | `shopping_lists`, `pantry_items` | lista consolidada por secciones; despensa ("lo que hay en casa") |
| Diabetes | `cgm_imports` → `cgm_readings` | importación (hash, formato, versión de parser, periodo, cobertura, avisos) y lecturas deduplicadas (`dedupeKey`) |
| | `glucose_events` | comida, ejercicio, sueño, enfermedad, estrés, alcohol, medicación, **insulina registrada como dato histórico**, glucemia capilar, notas |
| | `cgm_metric_periods` | instantáneas de métricas para comparar periodos y para la revisión semanal |
| | `raw_files` (local) | archivo original cifrado |
| Integraciones | `integration_connections` | proveedor, estado, permisos, última sync, último error (sin tokens) |
| | `oauth_credentials` (solo servidor) | tokens cifrados con `TOKEN_ENCRYPTION_KEY`; sin políticas RLS para clientes. En la v1 sin backend propio se usa cookie httpOnly cifrada |
| | `import_jobs`, `sync_jobs` (local) | trazabilidad de importaciones y sincronizaciones |
| IA y auditoría | `ai_conversations`, `ai_usage`, `user_feedback`, `audit_events` | conversación (opcionalmente no sincronizada), tokens/coste estimado, valoraciones, eventos de auditoría **sin contenido sensible** |
| Revisión | `weekly_reviews`, `experiments` | resumen semanal calculado y experimentos de hábitos (propuesto/aceptado/rechazado/hecho + resultado) |

Tablas solo locales (no se sincronizan): `outbox`, `meta`, `raw_files`, `activity_streams`, `sync_jobs`.

## Catálogos en código (versionados con la app)
- `lib/domain/training/library.ts`: ejercicios base con fotos (free-exercise-db, dominio público), `Equipment`, `MuscleId`.
- `lib/domain/nutrition/foods.ts` + `food-sources.ts`: alimentos semilla con fuente (USDA FoodData Central SR Legacy, dominio público) — editables/corregibles como alimento propio.
- `lib/domain/nutrition/recipes.ts`: recetas semilla.
- `lib/domain/training/templates.ts`: rutinas semilla (las dos originales + full body).

## Retención y borrado
- Local: indefinido hasta que el usuario borra. Archivos originales CGM: el usuario elige conservarlos o borrarlos tras importar.
- Nube (si se activa): mismos datos; "Borrar todo" elimina local + filas remotas del usuario (`delete` con RLS).
- IA: ver `SAFETY_AND_PRIVACY.md` (retención del proveedor).
