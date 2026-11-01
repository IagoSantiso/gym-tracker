# NEXO — Personal Health & Performance OS · Visión de producto

> Nombre configurable en Ajustes (`profiles.appName`). Documento vivo; última revisión 2026-11-01.

## Para quién
Una sola persona (diseño preparado para multiusuario): adulto con **diabetes tipo 1** en múltiples dosis de insulina, con FreeStyle Libre 2 Plus, que corre, monta en bici, retoma el gimnasio y camina en cinta mientras teletrabaja. Objetivos: perder grasa de forma sostenible, ganar/conservar músculo, mejorar condición física y entender mejor su glucosa.

## Problema
Los datos viven en silos (app del gimnasio, reloj Polar, LibreView, notas de comida). Ninguna herramienta une entrenamiento + comida + glucosa + recuperación con **criterio prudente** y **sin inventar precisión**.

## Propuesta
Una PWA local-first, rápida en el móvil y usable sin cobertura, que responde en segundos:
- ¿Qué toca hoy y qué he hecho realmente?
- ¿Qué como hoy, qué tengo que preparar o comprar, cuántos hidratos lleva cada comida?
- ¿Cómo he dormido y cómo me encuentro?
- ¿Qué muestran mis datos de glucosa importados (con su cobertura y sus límites)?
- ¿Qué cambios propone el sistema, por qué y con qué datos?

## Principios (resumen de los no negociables)
1. **Seguridad por diseño**: nunca diagnosticar, prescribir ni tocar insulina (dosis, ratios, basal, correcciones).
2. **Determinismo** en todo cálculo crítico (CGM, nutrición, unidades, cargas). La IA no calcula, explica.
3. **IA copiloto**: propone borradores; el usuario acepta o rechaza; todo cambio es reversible.
4. **Trazabilidad**: cada dato muestra su procedencia — *medido, importado, manual, calculado, estimado o borrador IA*.
5. **Sin falsa precisión**: rangos y márgenes de error, nunca "has quemado 612 kcal" o "perderás 230 g de grasa".
6. **Privacidad**: datos en el dispositivo por defecto; nube e IA son opt-in, granulares y revocables.
7. **Resiliencia offline**: registrar comida, entreno, peso o glucemia funciona en modo avión.
8. **No gamificar** la glucemia, el peso ni la restricción.

## Áreas
| Área | Qué resuelve |
| --- | --- |
| Hoy | Plan del día vs real, comidas, preparación, recuperación, glucosa importada, propuestas, acciones rápidas |
| Plan | Semana planificada (original, vigente, real), reglas de carga, bloqueos, propuestas de adaptación |
| Entrenamiento | Gimnasio (biblioteca con fotos, rutinas, sesión serie a serie, progresión), carrera, bici, cinta |
| Nutrición | Alimentos con fuente, recetas, menús semanales, sustituciones, hidratos por comida, lista de compra |
| Diabetes | Importación LibreView, TIR/TBR/TAR/CV/GMI, AGP, episodios, eventos, ejercicio↔glucosa, protocolo personal |
| Progreso | Peso y tendencia, fuerza, ritmos, calendario, revisión semanal, informes |
| Asistente | Chat sobre datos propios (herramientas de solo lectura) y propuestas con aprobación |
| Ajustes | Perfil, objetivos, consentimientos, integraciones, sincronización, exportar/borrar |

## Fuera de alcance (deliberadamente)
- Monitorización en tiempo real, alarmas clínicas o cálculo de bolos.
- Conectores no oficiales a LibreView/LibreLinkUp, scraping o almacenamiento de contraseñas de terceros.
- Marketplace de planes, red social, gamificación.

## Criterios de éxito
Los 14 criterios de aceptación del prompt maestro (sección 18), verificados en `PROJECT_STATUS.md`.
