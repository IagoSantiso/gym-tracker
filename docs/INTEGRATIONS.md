# Integraciones — verificación y diseño

Verificado el 2026-11-01 contra documentación oficial cuando existe. Arquitectura común: cada conector tiene **adaptador**, **permisos/consentimiento**, **estado** (`integration_connections`), **última sincronización**, **último error**, **procedencia** en cada registro (`source` + `externalId`) y **botón de desconexión**. Las importaciones son **idempotentes** (deduplicación por `externalId`/`dedupeKey`).

| Fuente | ¿Posible? | Implementación v1 |
| --- | --- | --- |
| LibreView / LibreLink (Abbott) | **Sin API pública** para pacientes/desarrolladores. Solo acuerdos B2B (p. ej. Epic) y agregadores con licencia de Abbott. Existen APIs no oficiales: **no se usan**. | Importación manual de CSV exportado por el usuario (+ PDF AGP experimental). Adaptador `ApiAdapter` reservado por si Abbott publica una API oficial. |
| Polar AccessLink v3 | **Sí**: cualquier usuario de Polar Flow puede crear un cliente en admin.polaraccesslink.com. | OAuth2 en servidor, registro de usuario, sincronización de ejercicios (30 días). |
| Android Health Connect | API **solo Android** on-device; una web/PWA no puede leerla. | No en v1. Diseño de companion Android documentado abajo. Mientras: importación CSV genérica de pasos/sueño. |
| Apple Health | Sin cliente iOS. | No. |
| Archivos TCX / GPX | Estándares abiertos (Polar Flow los exporta). | Importador en cliente con deduplicación. FIT: pendiente (formato binario). |
| Open Food Facts | API pública, datos ODbL (atribución + share-alike de la base). | Búsqueda por código de barras desde el cliente; se guarda fuente, licencia y fecha. |
| BEDCA | Consulta pública; licencia de redistribución no clara. | No se copia. El usuario puede crear alimentos propios con sus valores. |
| USDA FoodData Central | Dominio público (CC0). | Semilla de alimentos genéricos (SR Legacy), con fuente y aviso de "verificar con etiqueta". |

## LibreView (CSV)
- Formato observado (no documentado oficialmente por Abbott; fuentes comunitarias): línea 1 de metadatos ("Glucose Data / Datos de glucosa, Generated on…"), línea 2 cabeceras. Columnas relevantes: `Device`, `Serial Number`, `Device Timestamp`, `Record Type`, `Historic Glucose mg/dL|mmol/L`, `Scan Glucose …`, `Strip Glucose …`, `Notes`, insulina y carbohidratos. Record Type 0 = histórico (cada 15 min), 1 = escaneo; otros = notas/insulina/comida.
- Variantes soportadas: inglés/español, `,` `;` o tabulador, mg/dL o mmol/L, coma decimal, fechas `MM-DD-YYYY`, `DD-MM-YYYY` o `YYYY-MM-DD` (detección por los propios datos; si es ambigua se pide al usuario).
- La hora del CSV es la **hora local del lector sin zona**: se convierte a UTC con la zona elegida (Europe/Madrid por defecto), resolviendo cambios de hora (hueco de primavera → se desplaza; solapamiento de otoño → se marca ambiguo y se usa la primera ocurrencia).
- Las métricas usan solo lecturas históricas (tipo 0) para no sesgar por escaneos.
- Si el formato no se reconoce: **asistente de mapeo** (columna de fecha, de glucosa, unidad, formato de fecha).
- Recomendación de Glooko/LibreView: no reabrir y guardar el CSV en Excel antes de importar (puede alterar el formato).

## Polar AccessLink v3
- Autorización: `GET https://flow.polar.com/oauth2/authorization?response_type=code&client_id=…&redirect_uri=…&state=…` (scope `accesslink.read_all`).
- Token: `POST https://polarremote.com/v2/oauth2/token` con Basic `client_id:client_secret`, `grant_type=authorization_code`. El token **no caduca** salvo revocación; no hay refresh token documentado.
- Registro: `POST https://www.polaraccesslink.com/v3/users` `{"member-id": …}` (409 = ya registrado).
- Ejercicios: `GET /v3/exercises` (últimos 30 días y subidos tras el registro), `GET /v3/exercises/{id}?samples=true&zones=true`, descargas `/fit|/tcx|/gpx`.
- Actividad diaria: `GET /v3/users/activities?from&to` (rango ≤ 28 días, ≤ 365 días de antigüedad). Sueño y Nightly Recharge: endpoints documentados (pendiente de implementar).
- Webhooks: un webhook por cliente, firma `Polar-Webhook-Signature` (HMAC-SHA256). **No implementado en v1** (requiere backend persistente); se sincroniza bajo demanda.
- Variables: `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
- No se asume que el modelo de reloj aporte FC, potencia o sueño: cada campo es opcional.

## Health Connect (diseño de companion, no implementado)
- App Android mínima (Kotlin, Jetpack `androidx.health.connect`) que pide permisos granulares (pasos, sesiones de ejercicio, distancia, FC, sueño), lee en primer plano (o en segundo plano si se concede `READ_HEALTH_DATA_IN_BACKGROUND`) y exporta a la cuenta Supabase del usuario con su JWT.
- Límites: por defecto solo 30 días anteriores a la primera concesión de permisos (`PERMISSION_READ_HEALTH_DATA_HISTORY` para más). Al reinstalar se reinicia la ventana.
- No se usa Google Fit (en retirada).

## IA
Ver `ARCHITECTURE.md` y `SAFETY_AND_PRIVACY.md`. Proveedor por defecto Claude (`AI_PROVIDER=anthropic`, modelo `AI_MODEL`, por defecto `claude-opus-5-5`), alternativa OpenAI (`AI_PROVIDER=openai`, `OPENAI_MODEL`).

## Fuentes
- Polar AccessLink API v3: https://www.polar.com/accesslink-api/
- Health Connect (lectura de datos): https://developer.android.com/guide/health-and-fitness/health-connect/develop/read-data
- LibreView sin API pública (solo no oficiales/agregadores): https://libreview-unofficial.stoplight.io · https://www.nasdaq.com/articles/abbott-partners-epic-integrate-libre-cgm-data-us-health-record-systems
- Formato CSV LibreView (comunitario): https://gist.github.com/justinphelps/55caff791669a6130dd61a48771098eb
- OpenAI datos de API: https://developers.openai.com/api/docs/guides/your-data
