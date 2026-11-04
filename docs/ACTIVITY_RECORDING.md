# Registro de fuerza y Hoy

## Registrar lo que ya has hecho

- En **Hoy → Ejercicios de hoy**, toca una sesión para desplegar sus ejercicios. **Abrir sesión** lleva al registro serie a serie.
- Si ya la realizaste, pulsa **Ya la he realizado** y confirma. Se conservan los pesos y series guardados; no se inventan series, cargas ni repeticiones que falten. Las sesiones abiertas se muestran como **Sin finalizar**, con acceso a esa misma confirmación.
- La duración real es opcional y puede corregirse desde la fila completada. Sin duración, la sesión cuenta en el día, pero no aporta una estimación de gasto ni minutos de carga.
- Los enlaces ausentes de sesiones antiguas completadas se recuperan cuando coinciden con el plan del día. Un ejercicio independiente no completa otra rutina prevista.

## Añadir abdominales u otro ejercicio

En **Hoy → Añadir actividad**, busca el ejercicio, indica series, repeticiones y carga externa opcional y guarda. Ejemplo: **Crunch abdominal, 3 series, 25 repeticiones**. También está en **Registrar → Fuerza / abdominales**, en Entrenamiento → Actividad → Fuerza / abdominales y dentro de una sesión con **Añadir ejercicio extra**.

Puedes guardarlo como actividad independiente o adjuntarlo a una sesión abierta o completada de la fecha elegida. Las series figuran en el registro, volumen muscular y progreso. Si la sesión sigue abierta, hay que finalizarla para incorporarla a la referencia de próximas sesiones.

Al adjuntar a una sesión, deja los minutos adicionales vacíos si ya estaban incluidos en su duración. Si el total es desconocido, no se deduce de las repeticiones. El formulario registra repeticiones; las planchas por tiempo conservan su prescripción dentro de la rutina.

El catálogo añade 12 variantes de abdomen, con instrucciones revisadas en español y 24 fotos de inicio/final de [free-exercise-db](https://github.com/yuhonas/free-exercise-db), publicado bajo Unlicense/dominio público. Los identificadores originales están en `data/free-exercise-db-map.json`. El catálogo y las imágenes están disponibles offline; no necesita IA.

## Energía y comidas

El consumo registrado y el gasto estimado aparecen al principio de Hoy y se actualizan al guardar, sin recargar. La consulta reactiva mantiene la observación de IndexedDB al atravesar servicios asíncronos. El gasto representa el **día completo**, con base, pasos y ejercicio registrado; no equivale al gasto acumulado hasta esa hora. Las comidas pendientes se distinguen de las consumidas y de la previsión final. Si faltan datos para estimar el gasto, se muestra como desconocido junto a un acceso al perfil.

Todas las comidas del día se muestran como filas desplegables, incluidas las registradas. Un toque abre ingredientes y acciones; no es necesario recorrer una pila de botones para encontrar el plato.

## Persistencia y alcance

Las escrituras pasan por el repositorio local y su outbox. El guardado de ejercicios es transaccional e idempotente por solicitud. Confirmar dos veces una sesión no crea duplicados. No hay cambios de esquema ni migraciones.

Los datos que solo existen en el móvil no se pueden modificar desde una revisión del repositorio. Tras actualizar la PWA, las sesiones pendientes se pueden confirmar desde Hoy sin perder las series ya anotadas.
