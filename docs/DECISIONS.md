# Registro de decisiones (ADR ligeros)

Decisiones reversibles tomadas sin consultar, por petición expresa de ejecución autónoma. Cada una indica cómo revertirla.

| # | Decisión | Motivo | Alternativas / reversión |
| --- | --- | --- | --- |
| D1 | Evolucionar el Gym Tracker (Next.js 16 + TS + Tailwind) en vez de reescribir | Base moderna y mantenible; conserva fotos, tarjeta, temporizador y PWA | Restaurar con `git checkout restore/pre-nexo` |
| D2 | **Local-first** con IndexedDB (Dexie) como fuente de verdad en el dispositivo; Supabase como réplica opcional | Uso en gimnasio sin cobertura; privacidad por defecto; la app funciona sin backend ni cuentas | Servidor como fuente de verdad: cambiar `RemoteAdapter` y desactivar escritura local |
| D3 | Esquema único en TS (`lib/db/schema.ts`) que genera Dexie, SQL y whitelist de sync | Evita divergencias entre cliente y servidor con ~40 tablas | Migrar a Drizzle/Prisma si aparece backend propio |
| D4 | PK `(user_id, id)` y FKs compuestas | Imposibilita relaciones entre usuarios; ids generados en cliente offline | — |
| D5 | Sync última-escritura-gana por `updatedAt` + cursor `server_updated_at` | Un único usuario y pocos dispositivos; simple y auditable | CRDT si hubiera edición concurrente real |
| D6 | IA: **Claude por defecto** (`claude-opus-5-5`, esfuerzo `medium`, *fallback* de servidor activado) y OpenAI opcional | Petición de adaptar el prompt a Claude; proveedor configurable por env | `AI_PROVIDER=openai` |
| D7 | Herramientas de IA ejecutadas **en el cliente** (lectura de IndexedDB), servidor sin acceso a datos | Coherente con local-first; minimiza datos enviados; el servidor no guarda nada | Herramientas en servidor contra Supabase |
| D8 | Gráficas SVG propias | Control de accesibilidad (tabla de datos alternativa), sin dependencia pesada, AGP a medida | Recharts/Visx |
| D9 | Progresión de cargas **sugerida**, no aplicada (botón "Aplicar"); ajuste `autoApplyProgression` desactivado por defecto | Prompt maestro: "nunca automática sin confirmación" (prevalece sobre "precargar" del prompt del gimnasio) | Activar el ajuste |
| D10 | Rangos CGM por defecto del Consenso Internacional TIR 2019, editables y etiquetados | Hace falta un valor inicial; no se presentan como objetivo personal | El usuario introduce los de su equipo |
| D11 | Métricas CGM con lecturas históricas (tipo 0) y ponderadas por intervalo; GMI solo con ≥14 días y ≥70 % de cobertura | Consenso internacional; evita sesgo de escaneos | — |
| D12 | Alimentos semilla de USDA FDC (dominio público) en vez de BEDCA | Licencia clara; BEDCA sin licencia de redistribución clara | Añadir fuentes con licencia verificada |
| D13 | Polar: token cifrado en cookie httpOnly (sin tabla de servidor en v1) | Funciona sin backend persistente; el token no llega a JS | Guardar en `oauth_credentials` con service role |
| D14 | Sin webhooks ni sincronización en segundo plano en v1 | Requiere backend persistente; sync bajo demanda es suficiente para uso personal | Añadir cuando haya Supabase Edge Functions |
| D15 | Exportación PDF vía impresión del navegador (CSS de impresión) | Sin dependencias; el usuario guarda como PDF | jsPDF/servidor |
| D16 | Internacionalización preparada (locale/zonas/formatos con `Intl`), textos en español | Prioridad de producto; catálogos de mensajes en roadmap | — |
| D17 | Navegación: barra inferior en móvil (Hoy, Plan, Entreno, Comida, Diabetes, Más) y lateral en escritorio | 8 áreas no caben en una barra móvil | — |
| D18 | Sin modo demo con datos de salud ficticios en la UI; los datos sintéticos solo existen en tests | Evita mezclar datos falsos con reales | — |
| D19 | Rutas estáticas (sin segmentos dinámicos); parámetros por query | Precache completo para offline | — |
