# Fotos, archivos, dictado y productos propios

En Asistente puedes usar **Cámara**, **Fotos / archivos** o **Dictar**. Puedes enviar una foto sin texto, o varias fotos de tu nevera y pedir una cena con lo visible. Las etiquetas legibles permiten incorporar tus productos con sus valores reales.

- Imágenes: JPG, PNG y WebP. Se normalizan a JPEG, máximo 1600 píxeles por lado y se elimina la metadata al dibujarlas en canvas. Hasta 12 MB de entrada antes de comprimir.
- Documentos: PDF hasta 1,5 MB; TXT, CSV, JSON y Markdown hasta 50 KB. Hasta cuatro adjuntos por mensaje y un presupuesto compartido de 2,8 millones de caracteres para los adjuntos de toda la conversación. Si se supera, abre una conversación nueva o usa menos fotos. HEIC, hojas de cálculo y archivos de audio no están admitidos.
- Dictado: reconocimiento de voz del navegador en español. Pide permiso de micrófono, permite detenerlo y deja el texto editable antes de enviarlo. Su disponibilidad y procesamiento dependen del navegador y pueden necesitar red. Donde no está disponible puedes usar el dictado del teclado del teléfono. No graba ni sube archivos de audio al servidor de NEXO.

Al enviar, los adjuntos y el texto llegan al proveedor de IA configurado, bajo sus condiciones. Los archivos se mantienen en memoria en la conversación abierta; no se guardan en IndexedDB, copias ni sincronización. El historial conserva sus nombres y un aviso de que deben adjuntarse de nuevo para volver a analizarlos. Recargar también elimina los archivos en memoria. Los productos y las propuestas aceptadas sí usan la persistencia normal de la app.

## Productos y propuestas

`propose_food_products` permite proponer uno o varios productos nuevos. `propose_meal_variant` y `log_meal_estimate` admiten `new_products` con claves como `new:tuna`, referenciadas en `food_id`. Así una sola aprobación puede crear los alimentos y cambiar la cena o registrar lo ya comido.

Los datos incluyen valores por 100 g, procedencia (etiqueta, usuario o estimación), evidencia, base del peso (tal cual, escurrido o preparado), criterio de hidratos y alérgenos. La app valida coherencia y calcula las cantidades; los nutrientes ausentes siguen siendo desconocidos, no cero. Las estimaciones quedan identificadas como tales. Una foto exterior de un producto no demuestra los valores de su etiqueta. Ante dudas el asistente debe pedir solo la aclaración necesaria.

No se aplica nada antes de aceptar. Los productos, receta y cambio del menú se escriben en una transacción; un fallo revierte todas esas escrituras. Las propuestas pueden rechazarse o revertirse y el menú actualiza la lista de la compra.

## Verificación

`npm run lint`, `npm test`, `npm run build` y `npm run test:e2e`. La suite móvil incluye un proveedor y reconocimiento de voz simulados para verificar adjuntos, envío de imágenes sin texto, eliminación de archivos, dictado revisable y ausencia de archivos en el historial persistido. Las pruebas unitarias cubren las conversiones de imagen/PDF/texto para Claude y OpenAI, formatos, límites, productos por etiqueta, totales de cena, aceptación, reversión y fallo transaccional. La lectura real de fotos y el reconocimiento del micrófono deben comprobarse además con el proveedor configurado y el teléfono del usuario.
