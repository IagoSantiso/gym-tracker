# Estado del proyecto — NEXO v1

## Registro de fuerza y energía visible — 2026-11-04

- Hoy: consumido frente a gasto estimado del día completo arriba, con actualización reactiva al guardar; comidas y ejercicios como filas desplegables.
- Confirmar sesiones ya realizadas desde Hoy, rescatar sesiones abiertas y enlaces al plan; conserva cargas y series reales.
- Fuerza/abdominales sin IA, por series × repeticiones, independientes o añadidos a una sesión. Guardado transaccional e idempotente.
- 12 ejercicios de abdomen y 24 fotos públicas de free-exercise-db, incluidos en el modo offline.
- Últimas cargas por serie al cargar el historial, sin sobrescribir ediciones manuales. Sin duración conocida no se suponen 60 minutos.
- Validación: 170 pruebas unitarias, TypeScript, build, revisión de seguridad, recorridos E2E móviles y offline, y prueba de actualización del balance sin recargar.
- Uso y límites: `docs/ACTIVITY_RECORDING.md`. Sin cambios de esquema.


## Hoy y simplificación — 2026-11-04

- Inicio centrado en movimiento y comidas, un único registro y detalles bajo demanda.
- Cambios de ingrediente/plato accesibles desde Hoy; opciones locales y previsualizaciones conservadas.
- Menú por día, resumen semanal desplegable e impresión completa; Cocina con tres destinos principales.
- Navegación móvil simplificada, controles de teclado, temas y tamaños de pantalla verificados.
- Validación: 163 tests unitarios, build, seguridad y cinco recorridos E2E. Sin migraciones. Detalles: `docs/TODAY_UX.md`.

## Cocina personal — 2026-11-04

- Mi cocina: nevera, congelador, despensa y raciones preparadas; cantidades conocidas/desconocidas, fechas, edición manual y contexto de compra local.
- Inventario desde fotos mediante el asistente existente: borrador editable y aceptación explícita, sin registrar comida consumida ni inventar pesos.
- Dos bases de desayuno con tomate/lechuga y café con leche; rotación, frecuencias de recetas y bacalao ocasional por defecto.
- Sustitución local por ingrediente, con cantidades, compatibilidad culinaria, exclusiones, disponibilidad y efecto en plato/día; catálogo ampliado sin tokens y asistente opcional. Variantes aisladas y reversibles.
- Menú que prioriza existencias y fechas próximas; compra que descuenta existencias confirmadas. Consumo idempotente, devolución y raciones preparadas sin doble descuento.
- Migración incremental aplicada en Supabase, con RLS conservado. Instantánea SQL actual separada de las migraciones históricas.
- Validación: 159 tests unitarios, build de producción, seguridad del bundle, recorridos móviles y offline. Fotografías probadas mediante proveedor simulado en las pruebas automatizadas.
- Documentación de uso y límites: `docs/KITCHEN.md`.

Última actualización: **2026-11-02**. Rama: `claude/gym-tracker-pwa-migration-0v1inn`. Punto de restauración previo: tag `restore/pre-nexo` (commit `4e7ee9b`).

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

## Iteración 2026-11-02
- **Datos entre dispositivos**: restaurar copia pegando el JSON (o archivo sin filtro de tipo), con sustitución completa; botones «Copiar copia» y «Compartir». Sync segura (pull primero, adopción de la nube en dispositivo nuevo, LWW también en servidor — migración `20261102000000_lww_guard.sql`, aplicada en Supabase).
- **Cantidades**: cada comida muestra gramos por ingrediente, medidas caseras (unidades, cucharadas, rebanadas) y equivalente cocinado de lo que se pesa en crudo.
- **Balance del día** (Nutrición → Hoy y Hoy): comido + previsto frente a rangos (energía, proteína, grasa 25–35 %, hidratos pautados, fibra), mensajes y opciones deterministas para reajustar lo que queda (manteniendo hidratos).
- **Lo comido sustituye a lo previsto**: registrar en un hueco marca la comida del menú como sustituida; registro por etiqueta admite grasa.
- **IA**: `get_day_balance`, `log_meal_estimate` (base de datos + estimación validada para alimentos desconocidos, p. ej. rosquillas) y `propose_meal_variant` (cambiar ingredientes por los que tienes, aviso si cambian los hidratos). Nuevos guardarraíles: no compensar con ejercicio ni saltarse comidas (D25).
- Verificación: `npm test` 121 tests · `npm run test:e2e` 39 comprobaciones (incluye cantidades, balance y restaurar pegando).

## Iteración UI/UX 2026-11-02
- Feedback en todas las acciones importantes (spinner, check, avisos de éxito/error, botón que se «hunde» al pulsar), toasts accesibles encima de la barra inferior.
- Sincronización rehecha: estado claro (icono + texto + «última: hace X»), pasos numerados, código del email, recuperación si el enlace va a `localhost`, reenviar con cuenta atrás.
- Plan: intensidad como barra de color + texto, acciones sin apretar el texto en móvil; cabeceras con la descripción antes de los botones; pestañas con indicador de desplazamiento; balance del día compacto cuando no hay datos; asistente con botón para activarlo, indicador «pensando» y sugerencias de comidas.

- «Ajusta mi día» (Hoy y Nutrición → Hoy): texto libre → asistente (registra lo comido y propone el resto del día). Activación del asistente guiada en su pantalla (sesión + permisos por categoría).

- Balance energético del día (consumido vs gastado estimado, veredicto «Día en objetivo / Por encima / Te quedas corto») y compensación con actividad suave acotada (Ajustes → Preferencias: % máximo; herramienta IA `propose_compensation_activity`). Migración `20261102020000_compensation_pct.sql` aplicada.

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
- **Sync**: última escritura gana por registro (cliente y servidor); validado con PGlite y un remoto en memoria. El primer dispositivo que inicia sesión sube sus datos; los siguientes adoptan la nube. Los archivos originales de glucosa y las muestras de actividad no se sincronizan.
- **Cifrado local**: solo los archivos originales se cifran (AES-GCM, clave no exportable); el resto de IndexedDB depende de la seguridad del dispositivo.
- **Health Connect**: no disponible para web; requiere companion Android (diseñado en `docs/INTEGRATIONS.md`). FIT no soportado.
- **Alimentos**: 64 genéricos transcritos de USDA (verificar con etiqueta); BEDCA no incluido por licencia.
- **Sin notificaciones push ni alertas clínicas** (por diseño en v1). Recordatorio de pausas solo con la app abierta.
- **Idioma**: solo español (formatos con `Intl`; catálogos de mensajes en roadmap).
- **Wake Lock** depende del navegador (fallback silencioso).

## Próximos pasos sugeridos
Ver `docs/ROADMAP.md` → «Siguiente iteración».

## Rediseño del núcleo diario · 2026-11-05
Implementado: navegación Hoy/Entreno/Comida/Evolución, diario editable con búsqueda, recientes/favoritas/unidades, cierre explícito y balance coherente, fuerza por tiempo, correcciones de actividad, filtros y favoritas de ejercicios, contexto semanal y herramientas secundarias. Se conservan rutas, historial, funciones clínicas y funcionamiento local/offline.

Validación: pruebas de dominio y servicios en `tests/unit/diary.test.ts`; recorrido completo de navegador en `tests/e2e/daily-core.mjs`; migración SQL aditiva y RLS verificadas en PGlite. En este entorno Turbopack no puede abrir su puerto interno; la compilación de producción se verifica con `npm run build -- --webpack`. CI mantiene la compilación habitual con Turbopack.

Verificación final: 179 pruebas unitarias generales y 2 regresiones adicionales de edición de alimentos/borrado concurrente; lint/seguridad y build de producción correctos. Los siete recorridos E2E pasan (general, asistente, PDF, cocina, Hoy, fuerza y núcleo diario), incluidos offline y anchos 320/390/768/1280. Migración aditiva aplicada y consultada en el proyecto Supabase `nexo`; no introduce nuevas alertas del asesor. Se mantienen los avisos preexistentes: credenciales OAuth sin políticas de cliente (aislamiento deliberado) y protección de contraseñas filtradas desactivada ([documentación](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

## Corrección de comidas bloqueadas · 2026-11-05
Retiradas restricciones de IA y variantes locales para modificar comidas ya realizadas/bloqueadas. Menú y registro vinculado se actualizan juntos. Registro automático de comidas de hoy por horario local, explícitamente estimado, con edición/eliminación directa; no recrea eliminaciones ni rellena días anteriores. 183 pruebas unitarias pasan, incluidas regresiones de horario, idempotencia y corrección de una comida bloqueada completada.
