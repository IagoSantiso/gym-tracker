# Seguridad clínica, privacidad y cumplimiento

> NEXO **no es un dispositivo médico** ni un sistema de dosificación. Sirve para registrar, visualizar, analizar de forma descriptiva y preparar conversaciones con el equipo sanitario. Si algún día se distribuye o empieza a tomar decisiones clínicas, debe evaluarse con asesoría especializada si entra en el MDR (Reglamento (UE) 2017/745, regla 11 para software).

## 1. Guardarraíles clínicos (implementados en código)
| Regla | Dónde se aplica |
| --- | --- |
| Nunca sugerir dosis, ratios, factor de sensibilidad, basal/bolo, correcciones ni suspensión de insulina | Prompt de sistema + filtro de salida `lib/domain/safety/guardrails.ts` (bloquea y sustituye) + esquemas sin campos de insulina + tests |
| No recomendar ejercicio como tratamiento de hiperglucemia | Filtro de salida (patrones) + prompt |
| No emitir "apto para entrenar" ni diagnósticos (hipo grave, CAD…) | Prompt + filtro de salida |
| Emergencias (síntomas graves) | Detector de entrada: respuesta fija "sigue tu plan de emergencia y llama al 112"; no se consulta a la IA |
| Protocolo personal | Solo se muestra el texto que el usuario introduce desde las indicaciones de su profesional, con fuente y fecha; la app no lo genera |
| Sin alertas clínicas automáticas en v1 | No hay notificaciones de glucosa |
| Rangos de glucosa | Configurables; por defecto los del Consenso Internacional TIR 2019, etiquetados como "por defecto — confirma con tu equipo" |
| Insulina | Solo como **dato histórico opcional** registrado por el usuario; nunca se calcula ni se sugiere |
| Datos CGM | Siempre con periodo, cobertura, huecos, unidad y procedencia; aviso de que no es tiempo real; GMI solo con ≥14 días y ≥70 % de datos |
| Correlaciones | "Observaciones para revisar con tu equipo", nunca causalidad ni predicción |
| No gamificación | Sin rachas, medallas ni premios por peso, restricción o glucosa |
| Nutrición | Sin dietas extremas: déficit limitado (≤ 25 % del gasto estimado, nunca por debajo del metabolismo basal estimado, ritmo ≤ 1 %/semana) y sin "compensar" comida con ejercicio |

## 2. Referencias clínicas consultadas (fechadas)
Consultadas el 2026-11-01. Se usan como **contexto**, nunca como reglas personalizadas automáticas.
- Battelino T. et al. *Clinical Targets for CGM Data Interpretation: Recommendations From the International Consensus on Time in Range*. Diabetes Care 2019;42:1593–1603 (rangos TIR/TBR/TAR, ≥14 días y ≥70 % de datos, CV ≤ 36 %).
- Bergenstal R. et al. *Glucose Management Indicator (GMI)*. Diabetes Care 2018;41:2275–2280 (GMI % = 3,31 + 0,02392 × media mg/dL).
- Danne T. et al. *International Consensus on Use of CGM*. Diabetes Care 2017 (definición de episodios ≥ 15 min).
- Riddell M. et al. *Exercise management in type 1 diabetes: a consensus statement*. Lancet Diabetes Endocrinol 2017; Moser O. et al. *Glucose management for exercise using CGM… EASD/ISPAD position statement*. Diabetologia 2020 (contexto de patrones ejercicio-glucosa; **no** se implementan sus recomendaciones de ajuste de insulina).
- ADA. *Standards of Care in Diabetes—2026*. Diabetes Care 2026;49(Suppl 1).
- ADA/EASD. *Management of Type 1 Diabetes in Adults — Consensus Report 2026* (borrador sometido a consulta en sept-2025; verificar la versión final publicada antes de citarla). https://professional.diabetes.org/clinical-support/management-type-1-ada-easd-consensus-report

## 3. Privacidad (RGPD)
- **Categoría especial** (art. 9 RGPD: datos de salud). Uso personal/doméstico por el propio interesado: la "exención doméstica" (art. 2.2.c) cubre al usuario, **pero no** a los terceros que traten los datos (Supabase, Vercel, proveedor de IA), que actúan como encargados. Por eso nube e IA son **opt-in con consentimiento explícito, granular y revocable** (tabla `consents`). No afirmamos "cumplimiento" por tener una pantalla de consentimiento.
- **Minimización**: por defecto todo queda en el dispositivo (IndexedDB). A la IA solo se envían agregados (p. ej. TIR del periodo, nunca lecturas crudas) y solo de las categorías autorizadas.
- **Derechos**: exportación completa (JSON + CSV por dominio) y borrado total (local + remoto) desde Ajustes. Registro en `audit_events` sin contenido sensible.
- **Retención**: local hasta que el usuario borre; archivos originales CGM opcionales; conversaciones IA borrables.
- **Analítica/terceros**: ninguno. Sin telemetría, sin trackers.

### Proveedores de IA (verificado 2026-11-01; revisar periódicamente)
- **Anthropic (por defecto)**: la API comercial no usa los datos para entrenar modelos por defecto; conserva entradas/salidas un tiempo limitado para seguridad y abuso según sus políticas comerciales vigentes. ZDR solo por acuerdo.
- **OpenAI (opcional)**: no entrena con datos de la API por defecto. Los registros de supervisión de abuso pueden conservar contenido hasta 30 días; la Responses API guarda estado de aplicación salvo `store: false` (lo usamos). ZDR/monitorización modificada requieren aprobación previa. Fuente: https://developers.openai.com/api/docs/guides/your-data
- En la UI se muestra qué categorías se enviarían y se puede desactivar la IA por completo.

## 4. Seguridad técnica y modelo de amenazas
| Amenaza | Mitigación |
| --- | --- |
| Robo de clave de IA / abuso de coste | Clave solo en servidor; `/api/ai/chat` exige JWT Supabase + `ALLOWED_EMAILS`; límite por minuto y por día; `max_tokens` acotado; tamaño de petición limitado |
| Fuga de tokens Polar | OAuth en servidor; token cifrado AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) en cookie `httpOnly; Secure; SameSite=Lax`; `state` anti-CSRF |
| Acceso cruzado entre usuarios (nube) | RLS `user_id = auth.uid()` en todas las tablas; PK y FKs compuestas con `user_id`; test con PGlite |
| XSS | React escapa por defecto; sin `dangerouslySetInnerHTML` con datos de usuario; CSP restrictiva |
| CSRF | APIs con `Authorization: Bearer` (no cookies) salvo OAuth Polar (cookie `SameSite=Lax` + `state`) |
| Archivos maliciosos (CSV/PDF/TCX) | Procesado en el cliente; límite de tamaño (CSV 20 MB, PDF 10 MB, TCX/GPX 25 MB), comprobación de firma real (magic bytes `%PDF`, XML), parseo sin ejecución, validación fila a fila |
| Inyección de prompts vía datos | Herramientas de solo lectura; salidas de escritura = borradores validados con Zod y reglas; el modelo no tiene SQL ni acceso genérico |
| Logs con datos de salud | El servidor no registra cuerpos de petición ni respuestas; solo códigos y métricas de uso |
| Dispositivo perdido | Datos locales protegidos por el bloqueo del dispositivo; archivos originales cifrados; borrado remoto posible si hay nube |
| Datos CGM antiguos tomados como actuales | Aviso permanente "no es tiempo real" + fecha de última lectura |
