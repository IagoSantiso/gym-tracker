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
| D20 | Operaciones de generación (plan, menú, propuestas) serializadas con un cerrojo en memoria | Los efectos de React podían lanzar dos generaciones concurrentes y duplicar sesiones (detectado en E2E) | — |
| D21 | La insulina del CSV de LibreView se importa como `glucose_events` de tipo histórico y nunca se usa en cálculos | Conservar el dato original sin crear capacidad de dosificación | No importar esas columnas |
| D22 | Playwright no es dependencia del repo; CI lo instala con `--no-save` | El entorno local trae un Chromium preinstalado ligado a su versión | Añadir `@playwright/test` si se migra a su runner |
| D23 | El contexto (fecha, zona, unidad) se añade al PRIMER mensaje de cada conversación con la IA, no al prompt de sistema | Mantiene el prompt de sistema estable (caché) y el historial solo crece (compatible con thinking preservado) | Mensajes de sistema a mitad de conversación |
| D24 | Las restricciones numéricas/longitud de los esquemas de herramientas se eliminan del esquema enviado (modo estricto) y se validan con Zod en servidor y cliente | El modo estricto no admite minimum/maxLength/pattern | — |
| D25 | No se implementa "compensar" un exceso de comida con más ejercicio (más intensidad/duración o sesiones extra) ni saltarse comidas; el reajuste se limita a lo que queda por comer | Prohibido por el prompt maestro; con DM1 aumenta el riesgo de hipoglucemia y fomenta una relación poco sana con la comida | Sugerir ejercicio extra (descartado) |
| D26 | Menú sugerido ≠ lo comido: registrar algo en un hueco marca la comida prevista como `replaced` (recuperable) y el balance usa lo registrado | Adaptar el día a lo que realmente se come es más útil que obligar a seguir el menú | Borrar la comida prevista |
| D27 | Sync: pull antes de push; el primer sync de un dispositivo adopta la nube si ya tiene datos (instantánea local en `meta.preSyncBackup`) o sube todo si está vacía; valores por defecto con `updatedAt` 2000-01-01; el servidor ignora updates con `updated_at` más antiguo | Un dispositivo nuevo con valores por defecto o un menú propio pisaba/duplicaba los datos reales | Fusión campo a campo (CRDT) |
| D28 | Restaurar copia = sustituir (lo que no está en la copia se marca borrado y se sincroniza); se admite pegar el JSON | En móvil/PC no siempre se puede elegir el archivo; fusionar dejaba dos menús/planes por semana | Solo fusión por id |
| D29 | Rango de grasa por defecto 25–35 % de la energía (o pauta manual ±10 %) | Referencia habitual de ingesta (EFSA 20–35 %), ajustada a un perfil deportivo | Sin objetivo de grasa |
| D30 | Toda acción asíncrona relevante usa `ActionButton`/`useAction` (`components/ui`): bloquea doble pulsación, spinner, check al terminar y aviso con el resultado; toasts con tipo (ok/error/info) encima de la barra inferior | Las acciones parecían no hacer nada (sync, enviar enlace, generar menú…) | Estados ad hoc por pantalla |
| D31 | Acceso: además del enlace, se admite el código del email y pegar la dirección a la que llevó el enlace (`?code=` PKCE, `#access_token`, `token_hash`) | Si la Site URL de Supabase está mal configurada (p. ej. `localhost:3000`) el usuario puede completar el acceso igualmente | Solo enlace |

