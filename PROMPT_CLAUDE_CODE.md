# Prompt para Claude Code

```
Contexto
--------
En esta carpeta está index.html (antes gym-tracker.html): una app de entrenamiento en un solo archivo HTML/JS.
- Plan de gimnasio en modo 2 o 3 días por semana; cada grupo muscular se trabaja una vez por semana.
- Cada ejercicio tiene: 2 fotos (inicio/final) embebidas en base64, sacadas de free-exercise-db (dominio público),
  un mapa muscular SVG (frente/espalda), series, repeticiones, descanso y consejos técnicos.
- Se marcan las series una a una; al marcar una arranca un temporizador de descanso.
- Se guardan peso y repeticiones reales e historial de sesiones. Todo en localStorage.
- Interruptor "Adaptación" (máximo 2 series) para las primeras semanas.

Quiero convertirla en una web app instalable (PWA), desplegada en Vercel y con los datos en Supabase.
Respeta el diseño actual (tema oscuro, color lima #c5f36b, tarjetas, temporizador fijo abajo) y toda la funcionalidad existente.
Interfaz en español. Uso principal: móvil, en el gimnasio, a menudo con mala cobertura.

Stack
-----
Next.js (App Router) + TypeScript + Tailwind, Supabase (auth + Postgres), despliegue en Vercel.

Trabaja por fases. Al terminar cada fase, para, resume qué has hecho y cómo probarlo, y espera mi OK.

FASE 1: Migración + PWA
- Lee index.html entero y migra la lógica a componentes React tipados.
- Pasa los datos del plan y los ejercicios a un archivo de datos (lib/plan.ts).
- Saca las imágenes base64 a /public/exercises/<id>-0.jpg y <id>-1.jpg. Escribe un script que las extraiga del HTML, no las reescribas a mano.
- PWA: manifest, iconos, service worker con caché offline de la app y las imágenes. Debe funcionar en modo avión una vez instalada.
- Durante la sesión, Wake Lock API para que la pantalla no se apague (con fallback silencioso si no está soportada).
- El temporizador debe seguir siendo correcto si el móvil bloquea la pantalla: calcula sobre la hora de fin, no contando ticks.

FASE 2: Supabase + sincronización offline-first
- Login con magic link por email. Es una app de uso personal; no hace falta registro público complejo.
- Tablas con RLS por user_id: sessions (fecha, modo, día, notas), set_logs (session_id, exercise_id, nº serie, peso, reps, completada), user_settings (modo, adaptación).
- Offline-first: todo se escribe primero en local (IndexedDB) y se sincroniza con Supabase cuando hay conexión, con cola de pendientes e indicador discreto de estado de sincronización.
- Al primer login, importa los datos que ya existan en localStorage (claves gymLogs, gymLoads, gymSets, gymUI).
- Dame el SQL de migración en supabase/migrations y las variables de entorno necesarias en .env.example.

FASE 3: Progreso y progresión automática
- Pantalla de progreso: gráfica por ejercicio con el peso máximo y el volumen (series × reps × peso) semana a semana, y calendario de sesiones.
- Doble progresión en la tarjeta del ejercicio: si en la última sesión se llegó al máximo del rango de repeticiones en todas las series, sugerir +2,5 kg (+1 kg en ejercicios de aislamiento con mancuernas). Si no, mantener peso. Mostrarlo como "Hoy: X kg" precargado en el campo peso.
- Precarga peso y reps de la última sesión de cada ejercicio.

FASE 4 (opcional, no la empieces sin mi OK): Asistente IA
- Botón "Cambiar ejercicio" que propone 2–3 alternativas que trabajen los mismos músculos con otro material.
- Resumen semanal del historial (grupos atrasados, sugerencia de descarga).
- La llamada a la IA SOLO desde una route handler del servidor; la API key nunca en el cliente.
- Proveedor configurable por variable de entorno (Anthropic u OpenAI).
- La app debe funcionar perfectamente sin IA ni conexión; esto es un extra.

Reglas generales
- Antes de escribir código en cada fase, enséñame un plan corto de archivos y decisiones.
- Nada de datos inventados: los ejercicios, series y descansos son los del HTML original.
- Mantén la atribución a free-exercise-db en el pie.
- Prueba en viewport de 390 px de ancho y en escritorio.
- Haz commit al final de cada fase con un mensaje descriptivo.
- README con pasos para desplegar en Vercel y configurar Supabase.
```
