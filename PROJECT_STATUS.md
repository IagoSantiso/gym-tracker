# Estado del proyecto — NEXO v1

Última actualización: **2026-11-01**. Rama: `claude/gym-tracker-pwa-migration-0v1inn`. Punto de restauración previo: tag `restore/pre-nexo` (commit `4e7ee9b`).

## Resumen
Las fases 0–7 del prompt maestro (adaptado a Claude Code, ver `docs/PROMPT_MAESTRO_CLAUDE.md`) están implementadas como un monolito modular Next.js local-first. Además se completaron las fases pendientes del prompt original del gimnasio (sync offline-first con Supabase, importación de datos v2, progreso con gráficas, doble progresión, asistente IA con proveedor configurable).

| Fase | Estado | Evidencia |
| --- | --- | --- |
| 0 · Auditoría y arquitectura | ✅ | `docs/*.md`, investigación de integraciones con fuentes |
| 1 · Núcleo | ✅ | IndexedDB con esquema único, SQL + RLS validado en PGlite, sync (outbox/LWW), shell de 8 áreas, tema claro/oscuro, onboarding, exportar/borrar |
| 2 · Entrenamiento | ✅ | Biblioteca de 56 ejercicios con fotos reales, rutinas + constructor, sesión serie a serie, progresión RIR, cardio, planes de carrera, carga, plan semanal con reglas |
| 3 · Nutrición | ✅ | 64 alimentos (USDA) + OFF + etiqueta, 28 recetas, cálculo determinista, menús, sustituciones, compra, objetivos con rango |
| 4 · Diabetes/CGM | ✅ | Parser LibreView + genérico + PDF experimental, métricas, AGP, episodios, vista diaria con eventos, ejercicio↔glucosa, protocolo, informe |
| 5 · Integraciones | ✅ (parcial por diseño) | Polar AccessLink OAuth2 + ejercicios; TCX/GPX; CSV pasos/sueño. Health Connect documentado (requiere app Android) |
| 6 · IA | ✅ | Claude (por defecto) / OpenAI, herramientas en cliente, propuestas con aprobación, guardarraíles |
| 7 · Analítica y pulido | ✅ | Revisión semanal, informe imprimible/CSV, accesibilidad, E2E, CI, docs |

## Criterios de aceptación (sección 18)
| # | Criterio | Estado | Cómo se verifica |
| --- | --- | --- | --- |
| 1 | Crear y modificar una semana de entrenamiento | ✅ | Plan → Regenerar/editar/bloquear/mover; constructor de rutinas. E2E: "plan semanal generado", "sin duplicados" |
| 2 | Ejecutar una sesión registrando cada serie y carga | ✅ | E2E: serie con kg/reps → descanso → sesión en historial |
| 3 | Registrar carrera, bici y caminata en cinta | ✅ | Acción rápida «Entrenamiento» (velocidad/inclinación/teletrabajo para cinta; potencia solo con sensor), TCX/GPX, Polar |
| 4 | Menú semanal editable con cantidades e hidratos por comida | ✅ | E2E: 28 comidas con g de hidratos disponibles; tests de menú |
| 5 | Cambiar una comida y recalcular compra y valores | ✅ | E2E "sustitución de comida" + test de lista tras sustituir |
| 6 | Registrar peso y ver tendencia | ✅ | E2E (también offline); media móvil exponencial + ritmo semanal |
| 7 | Importar CGM real, mostrar periodo/calidad, métricas y AGP | ✅* | E2E con CSV sintético en formato LibreView. *Pendiente validar con un export real (formato no documentado oficialmente) |
| 8 | Superponer comidas/actividad/eventos con CGM | ✅ | Diabetes → Día |
| 9 | Consultar al asistente sobre datos propios | ✅* | Tests con proveedor simulado. *No probado contra la API real en esta sesión (sin clave) |
| 10 | Pedir adaptación del día y recibir propuesta explicada aceptable/rechazable | ✅ | Plan: «Me encuentro cansado», «Tengo poco tiempo», «No pude» + herramienta IA `propose_schedule_changes`; tests |
| 11 | Funcionar sin IA ni integraciones para el registro manual | ✅ | Todo el E2E se ejecuta sin claves; registro offline verificado |
| 12 | Exportar y borrar los datos personales | ✅ | E2E exportación JSON; borrado local+remoto (test con remoto en memoria) |
| 13 | Nunca generar dosis ni instrucciones terapéuticas | ✅ | 21 tests de guardarraíles + 14 de IA (emergencias, bloqueo de dosis en texto y en argumentos de herramientas, consentimientos); esquemas sin campos clínicos |
| 14 | Distinguir medido/importado/manual/calculado/estimado | ✅ | `SourceBadge` en registros, KPIs y propuestas |

## Verificación ejecutada
- `npm run lint` → TypeScript estricto + seguridad (secretos solo en servidor, `server-only`, bundle limpio).
- `npm test` → **108 tests** (unidades/zonas horarias con DST, parser CSV con casos corruptos/duplicados/LO-HI/mmol, TIR/TBR/TAR/CV/GMI con datasets de referencia, episodios, AGP, nutrición crudo/cocinado, menús, compra, objetivos, progresión RIR, e1RM, planificador, propuestas, guardarraíles, IA, sync, SQL + RLS entre usuarios).
- `npm run test:e2e` → **36 comprobaciones** en Chromium móvil: flujos de Hoy, plan, sesión, nutrición, importación CGM (y reimportación sin duplicados), progreso, informe, ajustes, tema claro/oscuro y **modo avión** (rutas precacheadas, navegación, datos locales, registro manual).
- `npm audit --omit=dev` → 0 vulnerabilidades.

## Configuración pendiente del propietario
Nada de esto bloquea el uso local. Detalle en `.env.example`.
1. **Vercel**: importar el repo y desplegar.
2. **Supabase** (sync multi-dispositivo): crear proyecto, aplicar `supabase/migrations/20261101000000_nexo_schema.sql`, activar magic link y redirect `https://<dominio>/ajustes`, variables `NEXT_PUBLIC_SUPABASE_*`, desactivar registros públicos.
3. **IA**: `ANTHROPIC_API_KEY` (o `AI_PROVIDER=openai` + `OPENAI_API_KEY`) y `ALLOWED_EMAILS`. Revisar condiciones de retención del proveedor antes de autorizar la categoría de glucosa.
4. **Polar**: cliente en admin.polaraccesslink.com, `POLAR_*` y `TOKEN_ENCRYPTION_KEY`.
5. **Rangos y protocolo**: introducir en Ajustes → Diabetes los rangos y el protocolo escritos por el equipo sanitario.
6. **Validación del parser** con un CSV real exportado de LibreView (no subirlo al repositorio).

## Limitaciones conocidas
- **LibreView**: formato CSV inferido de fuentes comunitarias (Abbott no lo documenta). Detección flexible y mapeo manual de respaldo; PDF solo extrae métricas agregadas (experimental).
- **Polar**: implementado según la documentación v3 pero sin probar contra la API real (requiere credenciales). Sin webhooks ni sueño/Nightly Recharge en v1. Solo ejercicios de los últimos 30 días subidos tras conectar.
- **IA**: sin prueba en vivo en esta sesión; límites de uso en memoria por instancia (en serverless son orientativos); coste estimado con precios publicados.
- **Sync**: última escritura gana; validado con PGlite y un remoto en memoria, no contra un proyecto Supabase real. Los archivos originales de glucosa y las muestras de actividad no se sincronizan.
- **Cifrado local**: solo los archivos originales se cifran (AES-GCM, clave no exportable); el resto de IndexedDB depende de la seguridad del dispositivo.
- **Health Connect**: no disponible para web; requiere companion Android (diseñado en `docs/INTEGRATIONS.md`). FIT no soportado.
- **Alimentos**: 64 genéricos transcritos de USDA (verificar con etiqueta); BEDCA no incluido por licencia.
- **Sin notificaciones push ni alertas clínicas** (por diseño en v1). Recordatorio de pausas solo con la app abierta.
- **Idioma**: solo español (formatos con `Intl`; catálogos de mensajes en roadmap).
- **Wake Lock** depende del navegador (fallback silencioso).

## Próximos pasos sugeridos
Ver `docs/ROADMAP.md` → «Siguiente iteración».
