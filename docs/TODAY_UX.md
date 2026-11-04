# Hoy como centro

La pantalla inicial concentra movimiento y comidas del día. Un único botón **Registrar** abre los registros existentes. Balance, salud, registros anteriores y personalización se consultan al desplegarlos.

## Comidas

- Se destaca una comida pendiente según la hora local del perfil; las demás siguen disponibles en **Otras comidas pendientes**. Este orden visual no registra ni modifica comidas.
- **Hecha** registra la comida. **Cambiar** permite sustituir un ingrediente, elegir otro plato o priorizar las existencias. Las alternativas del catálogo se calculan localmente, sin IA.
- Ingredientes, cantidades, preparación, nutrientes y acciones avanzadas se muestran bajo demanda. Los cambios conservan sus previsualizaciones y avisos sobre hidratos.
- La nota de cocina aparece cuando hay existencias con fecha próxima o ingredientes pendientes que no constan en el inventario. La ausencia en el inventario no demuestra que el alimento falte físicamente.

## Navegación

En móvil hay cuatro destinos principales: Hoy, Plan, Cocina y Glucosa. Entrenamiento, Progreso, Asistente y Ajustes permanecen en Más. La sesión prevista también se inicia desde Hoy.

Cocina muestra Menú, Mi cocina y Compra. Recetas, Alimentos, Objetivos y Balance y registros están en Más. Los enlaces anteriores con `?tab=` siguen funcionando.

El menú muestra un día cada vez, con selector de siete días y navegación por teclado. El resumen semanal es desplegable y la impresión incluye la semana completa.

## Verificación

163 pruebas unitarias; compilación de producción y control de seguridad; recorridos E2E generales, cocina sin conexión, asistente e importación PDF. El recorrido específico de Hoy comprueba registro, cambio de comida, navegación por teclado y ausencia de desbordamiento a 320, 768 y 1280 px. Las capturas y los recorridos usan datos sintéticos.

Esta iteración no cambia el esquema de datos, los cálculos nutricionales ni la configuración de proveedores.
