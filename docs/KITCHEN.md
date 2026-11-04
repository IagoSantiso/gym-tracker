# Mi cocina y variaciones de comidas

## Uso

- Nutrición → **Mi cocina** reúne nevera, congelador y despensa. Añade un ingrediente por nombre, vincúlalo al catálogo cuando exista y confirma los gramos que conoces. Una cantidad desconocida no equivale a cero ni se usa como existencias ilimitadas.
- **Añadir con fotos** abre el asistente con una petición preparada. Adjunta una o varias fotos. La herramienta `propose_pantry_items` genera un borrador editable: puedes corregir cantidades, lugar y nombres, o descartar identificaciones antes de aceptar. No registra comida consumida. No borra el inventario anterior; revisa duplicados.
- En **Variar ingredientes**, o al tocar un ingrediente de una comida prevista, se muestran alternativas locales. Se iguala el nutriente principal según la familia culinaria y se muestran las diferencias reales de energía, proteína, grasa e hidratos. También se ponderan existencias y el balance previsto del día cuando está disponible. No son equivalencias clínicas.
- El catálogo ampliado no consume tokens. El enlace al asistente es opcional y requiere sus consentimientos existentes.
- Se guarda una variante específica para esa comida, con pasos nuevos por componentes, conservando la receta original. Se bloquea para conservarla al regenerar. **Deshacer variante** recupera la receta anterior.
- Hay cuatro variantes de tus dos desayunos: jamón cocido o tortilla francesa, con tomate o lechuga, tostadas y café con leche. Las cantidades iniciales se pueden personalizar por ingrediente. La generación no escala automáticamente el desayuno completo.
- Cada receta puede ser habitual, ocasional (máximo una vez por semana), solo con existencias confirmadas, o nunca. El bacalao parte como ocasional; las preferencias explícitas del usuario prevalecen.
- La generación prioriza cobertura y productos con fecha próxima, rota desayunos y reserva cantidades durante la elección. **Regenerar** cambia la semilla, manteniendo comidas bloqueadas y realizadas.
- La lista de compra descuenta cantidades confirmadas, ignora fechas superadas y no incluye comidas ya realizadas. **Ya lo tengo** añade lo que falta al inventario.
- Al registrar una comida calculada se descuentan los ingredientes disponibles, una sola vez por registro, empezando por la fecha más próxima. **Descuentos recientes** permite devolver las existencias sin borrar lo comido. No se descuentan ingredientes de nuevo al comer un plato ya preparado.
- Las raciones preparadas se introducen expresamente con su receta, fecha y raciones. No se inventan sobras porque una receta permita cocinar por lotes.
- **Mi compra habitual y disponibilidad** guarda localidad, tiendas, productos habituales y alimentos difíciles de encontrar. Los últimos se excluyen del menú; el asistente recibe el contexto completo. La localidad no garantiza disponibilidad ni precios en tiendas.

## Datos y compatibilidad

La migración incremental `20261104120258_kitchen_inventory.sql` añade columnas opcionales a tablas existentes. Conserva los datos, índices y políticas RLS de propietario. Los clientes antiguos siguen funcionando; las columnas nuevas deben estar desplegadas antes de sincronizar esta versión.

`supabase/schema.sql` es la instantánea generada del esquema actual (`npm run db:sql`). Las migraciones históricas no se reescriben. La prueba SQL compara las columnas del resultado de todas las migraciones con las del esquema generado y mantiene las pruebas de aislamiento por usuario.

El inventario usa la sincronización LWW existente. Una fotografía no verifica caducidad, peso, estado del alimento ni alérgenos. Las cantidades iniciales y los alimentos genéricos son referencias; el jamón referencia la ficha de Campofrío Extra, la lubina CoFID/Seafish y la dorada IPMA. La ficha de cada alimento identifica la procedencia. Para el producto real se puede incorporar su etiqueta.

## Validación

La suite unitaria cubre exclusiones, cantidades desconocidas, fechas, adecuación culinaria, efecto del cambio en el plato y el día, frecuencias, reservas, ración real, descuento idempotente, reversión, variantes aisladas y consentimiento/aceptación del inventario por foto. El E2E `tests/e2e/kitchen.mjs` recorre añadir inventario, modificar una comida y recuperar existencias offline en móvil. La imagen real se procesa con los proveedores multimodales existentes; las pruebas automatizadas del asistente usan un proveedor simulado.
