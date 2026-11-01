# Roadmap y criterios de aceptación

Estado actualizado en `PROJECT_STATUS.md`. Todas las fases se ejecutan de forma autónoma (ver `docs/PROMPT_MAESTRO_CLAUDE.md`, sección 19).

| Fase | Entregable | Criterios de aceptación |
| --- | --- | --- |
| 0 · Auditoría | Docs de visión, arquitectura, modelo, seguridad, integraciones, decisiones; punto de restauración | Documentos en `docs/`, tag `restore/pre-nexo` |
| 1 · Núcleo | IndexedDB + esquema único, sync Supabase opcional (magic link, RLS, outbox), navegación de 8 áreas, tema claro/oscuro, onboarding, peso, notas, exportar/borrar, importación de datos v2 | Funciona offline; exporta y borra; SQL validado en PGlite con RLS |
| 2 · Entrenamiento | Biblioteca ampliada con fotos, filtros por equipo, rutinas + constructor, sesión serie a serie (peso/reps/RIR), progresión doble con confirmación, e1RM estimado, estancamiento, volumen por músculo, descarga, sustituciones, carrera/bici/cinta, carga sRPE, plan semanal con reglas | Criterios 1, 2, 3 |
| 3 · Nutrición | Alimentos con fuente, recetas, cálculo determinista, crudo/cocinado, menús semanales, sustituciones, lista de compra consolidada, objetivos con rango | Criterios 4, 5 |
| 4 · Diabetes | Importación CSV LibreView + genérica, PDF experimental, métricas, AGP, episodios, eventos, superposición actividad/comidas, ejercicio↔glucosa | Criterios 7, 8, 13 |
| 5 · Integraciones | Polar AccessLink (OAuth + ejercicios), TCX/GPX, CSV de pasos/sueño | Desconexión, estado, errores, idempotencia |
| 6 · IA | Chat con herramientas de solo lectura en cliente, propuestas con aprobación, guardarraíles | Criterios 9, 10, 13 |
| 7 · Analítica | Revisión semanal (3 logros, 2 oportunidades, 1 experimento), informe para consulta imprimible, CSV, accesibilidad, E2E, CI | Criterios 6, 11, 12, 14 |

## Siguiente iteración (post v1)
- Webhooks Polar + sueño/Nightly Recharge; importación FIT.
- Companion Android para Health Connect.
- Cifrado de extremo a extremo de los datos sincronizados (clave derivada de passphrase).
- Internacionalización completa (catálogos de mensajes).
- Validación del parser con un CSV real del usuario (anonimizado, nunca en el repo).
