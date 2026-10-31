# Gym Tracker

Plan de gimnasio en modo **2 o 3 días por semana**, trabajando cada grupo muscular una vez por semana.
Web app instalable (PWA) hecha con Next.js (App Router) + TypeScript + Tailwind.

- Fotos reales de cada ejercicio (posición inicial y final) y mapa muscular (frente / espalda)
- Series pulsables con temporizador de descanso (correcto aunque el móvil bloquee la pantalla)
- Registro de peso y repeticiones, historial de sesiones
- Modo "Adaptación" (2 series) para las primeras semanas
- Instalable y 100 % funcional sin conexión; la pantalla no se apaga durante la sesión (Wake Lock)

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000 (el service worker solo se registra en producción)
npm run build && npm start   # prueba la PWA real (offline, instalación)
npm run typecheck
```

Despliegue: importar el repositorio en Vercel (sin configuración extra).

## Estructura

| Ruta | Contenido |
| --- | --- |
| `lib/plan.ts` | Datos del plan (2 y 3 días) y biblioteca de ejercicios |
| `lib/muscles.ts` | Formas SVG del mapa muscular |
| `hooks/useRestTimer.ts` | Temporizador calculado sobre la hora de fin |
| `hooks/useWakeLock.ts` | Pantalla encendida durante la sesión |
| `hooks/useGymState.ts` | Estado persistente (`gymUI`, `gymSets`, `gymLoads`, `gymLogs`) |
| `public/sw.js` | Service worker (caché offline de app y fotos) |
| `legacy/index.html` | App original de un solo archivo (referencia y fuente de las fotos) |

## Scripts

- `npm run extract-images`: extrae las fotos base64 de `legacy/index.html` a `public/exercises/<id>-0.jpg` y `<id>-1.jpg`.
- `npm run generate-icons`: regenera los iconos PWA en `public/icons`.
- `prebuild` (automático): genera `public/precache.json` con los recursos que el service worker guarda al instalar.

## Hoja de ruta

Ver [`PROMPT_CLAUDE_CODE.md`](PROMPT_CLAUDE_CODE.md): Fase 1 (migración + PWA, hecha), Fase 2 (Supabase + sync offline-first), Fase 3 (progreso y progresión automática), Fase 4 (asistente IA, opcional).

## Créditos

Fotos de ejercicios: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (dominio público, Unlicense).
