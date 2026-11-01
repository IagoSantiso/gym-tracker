# PROMPT MAESTRO PARA CODEX — SUPERAPP PERSONAL DE BIENESTAR, ENTRENAMIENTO, NUTRICIÓN Y DIABETES TIPO 1

Actúa como un equipo senior formado por: arquitecto/a de software, product designer, ingeniero/a full-stack, especialista en seguridad y privacidad, ingeniero/a de datos, especialista en integración de wearables y asesor/a técnico/a en salud digital. Tu misión es convertir el proyecto de gimnasio existente en una aplicación personal de bienestar integral, avanzada, mantenible y ampliable.

No quiero una demo superficial ni una landing page bonita. Quiero una aplicación real, utilizable a diario, con persistencia, cálculos verificables, importación de datos, visualizaciones, planificación adaptativa, IA bien integrada y controles de seguridad. Construye sobre el proyecto existente siempre que sea técnicamente razonable; no lo reescribas a ciegas.

## 0. REGLA DE TRABAJO: AUDITA ANTES DE CAMBIAR

Antes de escribir o modificar código:

1. Inspecciona el repositorio completo y el estado de Git.
2. Identifica framework, lenguaje, arquitectura, dependencias, base de datos, autenticación, despliegue, tests, componentes reutilizables y funcionalidades ya implementadas.
3. Localiza la aplicación de gimnasio creada anteriormente. Conserva y mejora sus funcionalidades, especialmente la experiencia de selección/visualización de ejercicios y las rutinas.
4. Revisa todos los README, AGENTS.md, documentación, issues y variables de entorno de ejemplo.
5. Comprueba si existen datos locales, migraciones o cambios sin commit. No los sobrescribas.
6. No inventes capacidades de integraciones. Verifica documentación oficial y restricciones actuales antes de implementar conectores.
7. Produce primero:
   - `docs/PRODUCT_VISION.md`
   - `docs/ARCHITECTURE.md`
   - `docs/DATA_MODEL.md`
   - `docs/SAFETY_AND_PRIVACY.md`
   - `docs/INTEGRATIONS.md`
   - `docs/ROADMAP.md`
   - `docs/DECISIONS.md`
   - `PROJECT_STATUS.md`
8. Propón arquitectura y fases con criterios de aceptación. Si hay decisiones irreversibles o falta información crítica, pregunta. Para decisiones reversibles, escoge una opción sensata, documenta el motivo y avanza.
9. Crea un punto de restauración Git antes de cambios estructurales. Nunca hagas force-push, borres datos ni despliegues a producción sin autorización explícita.

No sustituyas una aplicación existente por un starter genérico. Si la base actual es adecuada, evoluciona sobre ella. Si no lo es, documenta los problemas y plantea una migración gradual.

## 1. VISIÓN DEL PRODUCTO

Nombre provisional: **NEXO — Personal Health & Performance OS** (nombre configurable).

Una aplicación privada para una sola persona inicialmente, diseñada para poder evolucionar a multiusuario sin rehacer el núcleo. Debe conectar:

- Pérdida de grasa y composición corporal.
- Nutrición, recetas, menús, hidratos de carbono, fibra y lista de compra.
- Entrenamiento de fuerza en gimnasio, carrera, ciclismo, caminatas y movilidad.
- Planificación diaria y semanal adaptativa.
- Diabetes tipo 1 y datos CGM de FreeStyle Libre 2 Plus.
- Recuperación, sueño, fatiga, carga de entrenamiento y hábitos.
- Asistente IA que explica, resume y propone cambios con transparencia.
- Historial longitudinal y revisión semanal.

La aplicación no debe intentar maximizar todas las métricas a la vez. Debe equilibrar pérdida de grasa, mantenimiento/ganancia muscular, resistencia, recuperación, seguridad glucémica y sostenibilidad.

### Perfil inicial configurable

Usa como datos iniciales editables, no como verdades inmutables:
- Adulto con diabetes tipo 1.
- Utiliza FreeStyle Libre 2 Plus y FreeStyle LibreLink/LibreView.
- Tratamiento con múltiples dosis de insulina; no asumir dosis ni ratios.
- Corre, hace ciclismo, está retomando el gimnasio y puede caminar en cinta durante teletrabajo.
- Objetivos: perder grasa, ganar/conservar músculo, mejorar condición física y gestionar mejor la diabetes.
- Tiene reloj Polar (modelo/configuración deben confirmarse en ajustes).
- Sistema métrico, kg, cm, km, min/km, °C, zona horaria Europe/Madrid.
- Idioma principal: español; preparar internacionalización.

No hardcodees peso, altura, edad, dosis, glucemia objetivo, calorías ni macros. Deben recogerse en un onboarding y poder editarse. Los datos recordados pueden precargarse como borrador con confirmación del usuario.

## 2. PRINCIPIOS NO NEGOCIABLES

1. **Safety by design:** nunca diagnosticar, prescribir ni modificar dosis de insulina.
2. **Determinismo para cálculos críticos:** cálculos nutricionales, unidades, estadísticas CGM, zonas de entrenamiento y validaciones se realizan en código probado, no se delegan al LLM.
3. **IA como copiloto, no autoridad:** la IA propone, explica y resume; el usuario acepta los cambios. No puede cambiar tratamientos, umbrales médicos ni objetivos clínicos.
4. **Trazabilidad:** cada recomendación indica datos utilizados, fecha, supuestos, nivel de confianza, limitaciones y motivo.
5. **Datos originales inmutables:** conserva importaciones originales y registra transformaciones/versiones.
6. **Sin falsa precisión:** no inferir calorías quemadas exactas, gramos de grasa perdidos, glucosa futura ni recuperación real a partir de datos incompletos.
7. **Privacidad primero:** datos de salud sensibles, minimización, cifrado, control de exportación y borrado.
8. **Offline/resiliencia:** los registros manuales y funciones esenciales deben funcionar aunque la API de IA o una integración externa no esté disponible.
9. **Accesibilidad y móvil:** diseño responsive, excelente uso en móvil, contraste, tamaños táctiles y navegación por teclado.
10. **No gamificar la glucemia:** nunca premiar estar bajo de peso, restringir comida o mantener glucosa en un rango de forma que fomente conductas peligrosas.

## 3. EXPERIENCIA Y NAVEGACIÓN

Diseña una interfaz profesional, clara y visualmente excelente, no un panel administrativo genérico.

Navegación principal:
1. **Hoy**
2. **Plan**
3. **Entrenamiento**
4. **Nutrición**
5. **Diabetes**
6. **Progreso**
7. **Asistente**
8. **Ajustes**

### Dashboard “Hoy”
Debe responder en pocos segundos:
- ¿Qué toca hoy?
- ¿Qué he hecho realmente?
- ¿Qué comidas tengo previstas?
- ¿Qué debo preparar o comprar?
- ¿Cómo ha sido mi descanso/recuperación?
- ¿Hay datos glucémicos o alertas relevantes que revisar?
- ¿Qué cambios propone el sistema y por qué?

Mostrar plan previsto frente a actividad real, estado de cumplimiento sin culpabilizar, resumen de nutrición, entrenamiento, movimiento, sueño y glucosa. Distinguir claramente dato medido, importado, introducido manualmente y estimado.

Incluir acciones rápidas:
- Registrar comida.
- Registrar glucemia/evento.
- Registrar entrenamiento.
- Registrar peso.
- Marcar comida como realizada y sustituirla.
- Marcar entrenamiento como completado, modificado o cancelado.
- Añadir nota de energía, hambre, estrés, dolor o fatiga.

## 4. ONBOARDING Y PERFIL

Crear un onboarding progresivo, editable y con posibilidad de omitir datos no imprescindibles.

Recoger:
- Edad/fecha de nacimiento (si necesaria), sexo biológico solo si el usuario quiere usar ecuaciones que lo requieran; explicar por qué.
- Altura, peso actual, evolución reciente, perímetro cintura opcional.
- Objetivo y ritmo de pérdida de peso deseado, con límites prudentes.
- Preferencias, alergias, intolerancias, alimentos excluidos, presupuesto, tiempo de cocina, número de comidas, equipamiento.
- Experiencia deportiva, días/horas disponibles, lesiones/limitaciones introducidas por el usuario.
- Gimnasio disponible y catálogo de máquinas/material.
- Carrera: ritmos recientes, distancias, zonas si están configuradas y objetivos.
- Bicicleta: frecuencia, duración, intensidad.
- Pasos y caminata en cinta.
- Diabetes: tipo 1, dispositivo CGM, unidades mg/dL o mmol/L, tratamiento descrito por el usuario, objetivos prescritos por su equipo sanitario, hipoglucemia inadvertida si desea registrarla, protocolo personal de ejercicio/hipoglucemia proporcionado por su equipo médico.
- Integraciones conectadas.
- Consentimientos granulares y revocables.

No pedir credenciales de LibreView ni contraseñas de servicios externos.

## 5. MOTOR DE PLANIFICACIÓN ADAPTATIVA

Construye un planificador semanal y diario que diferencie:
- Plan original.
- Plan vigente.
- Actividad real.
- Cambios sugeridos.
- Cambios aceptados/rechazados y su motivo.

Entradas:
- Disponibilidad horaria.
- Sesiones planificadas y realizadas.
- Carga reciente y distribución de intensidades.
- Sueño, fatiga, dolor y percepción de esfuerzo.
- Tendencias de peso y adherencia.
- Preferencias y comidas disponibles.
- Datos glucémicos históricos/contextuales, solo para análisis retrospectivo y recordatorios de seguridad aprobados.
- Tiempo meteorológico solo si se añade una integración fiable y consentida; no es requisito inicial.

Salidas:
- Qué entrenamiento realizar hoy, duración, intensidad, ejercicios, series, repeticiones, descansos y progresión.
- Qué sesión sustituir si cambia el día.
- Cómo redistribuir la semana sin acumular sesiones duras.
- Menú y cantidades orientativas para el día, respetando preferencias y necesidades de hidratos.
- Preparación previa y posterior a entrenamiento, sin prescribir dosis de insulina.
- Explicación de por qué se propone cada cambio.

Reglas:
- No “compensar” comidas con ejercicio ni entrenamientos perdidos con sobreentrenamiento.
- No recortar drásticamente calorías por un día sedentario.
- No usar estimaciones de calorías de un reloj como verdad absoluta.
- No proponer dos sesiones intensas consecutivas por defecto.
- Mantener días de recuperación.
- El usuario puede bloquear sesiones, comidas o días.
- Toda adaptación debe ser reversible y requerir aceptación, salvo ajustes de visualización no clínicos.

Implementa motor de reglas determinista y auditable para restricciones duras; la IA puede sugerir entre opciones permitidas.

## 6. ENTRENAMIENTO: FUERZA, CARRERA, BICI Y MOVIMIENTO

### 6.1 Gimnasio
Conserva la app existente y amplíala:
- Biblioteca de ejercicios con imágenes/fotos realistas y vídeos o referencias fiables cuando existan.
- Músculos principales/secundarios, equipo, dificultad, instrucciones, errores frecuentes, variantes y contraindicaciones generales.
- Filtros por máquina, peso libre, poleas, bandas, mancuernas y peso corporal.
- Rutinas full-body, torso/pierna, empuje/tirón/pierna y personalizadas.
- Constructor de rutinas con drag & drop si encaja con la tecnología existente.
- Series, repeticiones, carga, RIR/RPE, descanso, tempo y notas.
- Registro de cada serie durante el entrenamiento con controles rápidos.
- Historial por ejercicio y gráfico de progresión.
- Estimación de 1RM solo como estimación claramente etiquetada.
- Progresión sugerida basada en rendimiento y RIR, nunca automática sin confirmación.
- Detección de estancamiento orientativa.
- Temporizador de descanso.
- Sustitución de ejercicios por material ocupado o molestias.
- Deload y semanas de descarga configurables.
- Volumen por grupo muscular y frecuencia semanal.
- Importación/exportación de rutinas.

Cada sesión debe poder ejecutarse cómodamente desde el móvil, con pantalla activa y controles grandes si la plataforma lo permite.

### 6.2 Carrera
- Planificador de sesiones: recuperación, rodaje fácil, tirada larga, tempo/umbral, intervalos, cuestas, técnica y competición.
- Ritmo, distancia, duración, zonas FC, RPE y objetivo de sesión.
- Planes de 5K, 10K, media maratón y distancia personalizada.
- Distribución de intensidad y carga semanal.
- Comparación planificado vs realizado.
- Historial de ritmos y evolución.
- Progresión prudente, sin reglas simplistas del 10% como garantía de seguridad.
- Registrar calzado y kilometraje acumulado opcional.
- Considerar el efecto de fuerza de piernas y ciclismo en la recuperación.

### 6.3 Ciclismo
- Salida interior/exterior, duración, distancia, desnivel, potencia si existe, FC, RPE y notas.
- Rodaje fácil, resistencia, tempo e intervalos.
- No inventar potencia si no hay sensor.
- Importar sesiones desde fuentes autorizadas.

### 6.4 Caminata en cinta / NEAT
- Registro de velocidad, inclinación, duración y pasos si se conocen.
- Objetivos flexibles de movimiento diario.
- Recordatorios configurables para pausas activas.
- Posibilidad de marcar caminata mientras teletrabaja.
- Evitar que la app trate los pasos como obligación rígida.

### 6.5 Métricas y carga
Calcular y explicar:
- Duración, distancia, ritmo, FC media/máxima, RPE.
- Carga interna basada en duración × RPE, claramente etiquetada como aproximación.
- Tendencia de carga aguda/crónica solo si se presenta con advertencias y no como predictor clínico.
- Volumen de fuerza por grupo muscular.
- Tiempo en zonas, si las zonas están configuradas.
- Recuperación percibida, no “readiness” médica.

## 7. NUTRICIÓN Y MENÚS

Construye un sistema nutricional completo, no un simple generador de recetas.

### 7.1 Objetivos
- Pérdida de grasa gradual y sostenible.
- Preservar/ganar masa muscular.
- Saciedad, calidad nutricional y adherencia.
- Fibra suficiente y variedad vegetal.
- Distribución flexible de hidratos para actividad y diabetes.
- Evitar dietas extremas, ayunos forzados o demonizar grupos de alimentos.

No calcular un objetivo calórico definitivo hasta tener datos mínimos y mostrar rango estimado, fórmula usada y margen de error. Permitir objetivo manual acordado con profesional. Revisar tendencias de 3–4 semanas antes de sugerir cambios de objetivo.

### 7.2 Generador de menús
- Menú diario y semanal.
- Desayuno, comida, cena, snacks y opciones pre/post entrenamiento.
- Cantidades en gramos/ml y raciones.
- Diferenciar peso en crudo/cocinado.
- Ingredientes, pasos, tiempo, dificultad, coste orientativo opcional.
- Sustituciones equivalentes.
- Recetas favoritas, historial, rotación y lista negra.
- Menús reutilizables, calendario y arrastrar comidas.
- Recalcular cantidades para raciones.
- Lista de compra agrupada por secciones y cantidades consolidadas.
- Preparación por lotes / meal prep.
- Aprovechamiento de sobras.
- Adaptación al tiempo real disponible y a lo que hay en casa.
- Exportar/ imprimir menú y lista de compra.

### 7.3 Composición y cálculos
Mantener base de datos nutricional con fuente, versión y fecha:
- Energía, proteína, hidratos disponibles, fibra, grasas, saturadas, azúcares y sal.
- Hidratos totales y disponibles claramente diferenciados según la fuente.
- Porciones y equivalencias.
- Cálculo determinista por ingrediente y receta.
- Redondeos y tolerancias documentados.
- No inventar micronutrientes ni valores ausentes.
- Permitir crear alimentos propios y corregir etiquetas.

Priorizar fuentes fiables y legales (por ejemplo, BEDCA, Open Food Facts con atribución/licencia y datos de etiqueta aportados por usuario). No copiar bases de datos sin comprobar licencia.

### 7.4 Diabetes y comida
- Mostrar gramos de hidratos por ingrediente, receta, ración y comida.
- Identificar fibra y alimentos con potencial de absorción más lenta, sin afirmar que el índice glucémico predice exactamente la respuesta individual.
- Etiquetar estimaciones, no “dosis recomendada”.
- Registrar hora de comida y composición.
- Relacionar retrospectivamente comidas y glucosa si hay datos suficientes.
- Permitir anotar insulina administrada como dato histórico opcional, pero jamás calcular bolos, sugerir dosis ni ajustar ratios.
- No dar recomendaciones de corrección de glucosa.
- La aplicación puede mostrar el plan de hidratos aprobado por el usuario/equipo sanitario, sin modificarlo.

## 8. DIABETES TIPO 1 Y CGM — MÓDULO DE SEGURIDAD CRÍTICA

Este módulo es para registro, visualización, análisis descriptivo y preparación de conversaciones con el equipo sanitario. No es un dispositivo médico ni un sistema de dosificación.

### 8.1 Importación FreeStyle Libre 2 Plus / LibreView
Investiga primero las vías oficiales disponibles en el país y para el dispositivo exacto:
- Verifica si Abbott ofrece una API pública y autorizada para pacientes/desarrolladores en España.
- No asumas que LibreView tiene una API pública.
- No automatices login, scraping, ingeniería inversa, extracción de cookies ni acceso no autorizado.
- No solicites ni almacenes la contraseña de LibreLink/LibreView.
- Prioriza importación manual de informes exportados por el usuario (PDF/CSV u otros formatos realmente disponibles; no des por hecho que el portal permite exportar cada formato en todas las regiones/cuentas). Abbott describe LibreView como plataforma para visualizar y compartir informes, pero no se debe asumir que exista una API pública para pacientes/desarrolladores. Verifica las opciones reales de exportación de la cuenta y del país antes de diseñar el parser.
- Si el usuario sube PDF AGP, extrae métricas y tablas; si sube CSV, procesa lecturas individuales cuando el formato esté documentado.
- Diseña parser modular por formato/versión, con validación, detección de duplicados, timezone, unidades y control de calidad.
- Conservar archivo original cifrado o permitir borrarlo tras procesarlo.
- Mostrar periodo cubierto, porcentaje de datos válidos, lagunas, unidad y procedencia.
- Nunca presentar datos incompletos como perfil completo.
- Prever un adaptador futuro para una API oficial si Abbott la habilita.

### 8.2 Métricas CGM
Calcular con tests:
- Tiempo en rango (TIR), por debajo (TBR), por encima (TAR).
- Rangos configurables por el usuario y procedentes de su plan clínico, sin imponer uno universal.
- Media de glucosa, GMI solo cuando haya cobertura suficiente y etiquetado como estimación.
- Coeficiente de variación (CV).
- Desviación estándar.
- Percentiles y perfil diario AGP si los datos lo permiten.
- Episodios de hipo/hiper con reglas transparentes y configurables, no diagnóstico automático.
- Tiempo de datos disponibles, frecuencia de lectura y huecos.
- Comparativas entre periodos equivalentes.
- Vista diaria, semanal, mensual y por franjas horarias.
- Eventos anotados: comida, ejercicio, sueño, enfermedad, estrés, alcohol, medicación, etc.
- Correlaciones descriptivas, sin inferir causalidad.

Asegurar unidades mg/dL y mmol/L con conversiones y tests; conservar precisión original.

### 8.3 Contexto de ejercicio y glucosa
- Superponer eventos de carrera, bici, fuerza y caminata con curva CGM.
- Comparar tendencias retrospectivas por tipo, duración e intensidad de ejercicio.
- Mostrar posibles patrones: bajadas durante ejercicio aeróbico, hiperglucemia tras alta intensidad, hipoglucemias tardías/nocturnas, etc., solo como observaciones para revisión.
- No predecir ni garantizar respuesta individual.
- No recomendar cambios de insulina basal/bolo ni porcentajes de reducción.
- No generar instrucciones de tratamiento basadas en una lectura aislada.
- No usar la app como monitor en tiempo real ni sustituir el lector/app oficial.
- Dejar claro que la app puede tener retrasos, huecos o datos importados desactualizados.

### 8.4 Guardarraíles clínicos obligatorios
- Nunca sugerir dosis de insulina, cambios de basal/bolo, ratios, factor de sensibilidad, correcciones ni suspensión de insulina.
- Nunca recomendar ejercicio como tratamiento de hiperglucemia.
- No emitir autorización de “apto para entrenar”.
- No diagnosticar hipoglucemia grave, cetoacidosis u otras complicaciones.
- Mostrar protocolo personal de seguridad solo si el usuario lo ha introducido desde indicaciones de su profesional.
- Incluir acceso rápido a los pasos de actuación que el usuario haya configurado.
- Si el usuario comunica síntomas graves o una emergencia, indicar que siga su plan de emergencia y contacte con servicios sanitarios; no improvisar un protocolo.
- No establecer alertas clínicas automáticas en la primera versión.
- Cualquier texto clínico generado por IA debe pasar por una capa de reglas y mostrar fuentes/fecha si se apoya en guías.
- Las guías clínicas cambian: no codificar dosis ni protocolos concretos como reglas fijas. Consultar y fechar fuentes clínicas vigentes; tomar como referencia inicial el consenso ADA/EASD 2026 para adultos con diabetes tipo 1 y los Standards of Care 2026, sin convertir sus rangos o recomendaciones generales en reglas personalizadas automáticas.

## 9. INFORMES, ANALÍTICA Y REVISIÓN SEMANAL

Crear un “Weekly Review” que resuma:
- Peso y tendencia (promedio móvil, no juzgar fluctuaciones diarias).
- Cumplimiento flexible del plan.
- Sesiones previstas vs realizadas.
- Evolución de fuerza, carrera y bici.
- Movimiento diario y caminatas.
- Sueño/fatiga si hay datos.
- Nutrición: proteína, fibra, hidratos y regularidad.
- CGM: TIR/TBR/TAR/CV y calidad/cobertura de datos.
- Patrones observados entre actividad, comidas y glucosa.
- 3 logros, 2 oportunidades de mejora y 1 experimento pequeño para la semana siguiente.

Los experimentos son hábitos no clínicos (p. ej., preparar desayunos, caminar tras comer), no cambios de medicación. Permitir aceptar, rechazar y anotar resultados.

Generar informes PDF/CSV descargables para el usuario y un resumen para llevar a consulta, distinguiendo datos, observaciones e hipótesis. No generar conclusiones médicas.

## 10. INTEGRACIONES Y ESTRATEGIA DE DATOS

Implementa una arquitectura de conectores desacoplada: cada integración debe tener adaptador, permisos, estado, última sincronización, errores, procedencia y botón de desconexión.

### Prioridad A: Polar
Investiga Polar AccessLink actual (v3/v4 según disponibilidad), condiciones de registro, OAuth2, permisos, retención/ventanas de datos y scopes.
Si el acceso está disponible para una app personal, implementa OAuth2 seguro en backend:
- sesiones y tokens cifrados;
- refresh/rotación según documentación;
- webhooks si se admiten;
- sincronización incremental e idempotente;
- importación de entrenamientos, muestras, FC, distancia, duración, carga y actividad diaria/sueño solo cuando la API lo exponga.
No asumas que el modelo Polar del usuario proporciona todas las métricas.
No pongas client secret en frontend.

### Prioridad B: Android Health Connect
Evaluar integración Android para pasos, sesiones, distancia, FC, sueño y otros registros autorizados.
Importante: Health Connect es una API Android; una web app no puede leerla directamente. Si el proyecto es PWA/web, diseñar un pequeño companion Android solo si el beneficio lo justifica. Respetar permisos granulares, historial permitido y restricciones de lectura en background/rutas.
No asumir que Google Fit sigue siendo la vía adecuada.

### Otras fuentes
Evaluar Apple Health solo si existe una necesidad real y un cliente iOS. Considerar importación estándar FIT/TCX/GPX/CSV si es viable y legal. No integrar diez plataformas antes de validar Polar + importación manual.

### LibreView
La vía manual es la opción inicial por defecto hasta verificar una API oficial accesible. No crear conectores no oficiales ni automatizaciones que puedan poner en riesgo la cuenta o los datos.

## 11. ASISTENTE IA — OPENAI API

Implementa integración server-side con la API actual de OpenAI, usando documentación oficial vigente en el momento del desarrollo. Preferir Responses API cuando sea apropiada; Structured Outputs para respuestas tipadas y function calling solo para operaciones explícitas y acotadas.

### Arquitectura
- El frontend nunca recibe `OPENAI_API_KEY`.
- Proxy/backend propio.
- Configuración por variables de entorno.
- Modelo configurable desde backend, sin hardcodear un nombre obsoleto.
- Límites de coste, rate limiting, timeouts, reintentos prudentes y registro de uso.
- Separar prompts por dominio: entrenamiento, nutrición, revisión semanal, CGM, chat general.
- Contexto mínimo necesario; no enviar todo el historial ni informes completos si basta con estadísticas agregadas.
- Redacción/anonimización cuando sea posible.
- No incluir datos sensibles en logs, trazas, analítica o errores.
- Mostrar al usuario qué categorías de datos se enviarán a IA y permitir desactivar IA.

### Funciones permitidas
La IA podrá:
- Proponer una rutina usando el catálogo y restricciones existentes.
- Ajustar una sesión futura dentro de reglas permitidas.
- Generar menús a partir de alimentos y macros disponibles.
- Sugerir sustituciones de recetas.
- Resumir tendencias y preparar preguntas para consulta.
- Explicar métricas.
- Responder sobre datos del usuario mediante funciones read-only.
- Proponer cambios de planificación que requieren aprobación.

### Funciones prohibidas
La IA nunca podrá:
- Crear o modificar dosis, ratios o pautas de insulina.
- Ordenar cambios terapéuticos.
- Cambiar umbrales clínicos.
- Desactivar guardarraíles.
- Borrar datos o exportar informes a terceros sin confirmación.
- Ejecutar acciones irreversibles sin confirmación explícita.

### Herramientas de IA
Define funciones tipadas, con mínimo privilegio, por ejemplo:
- `get_user_profile_summary`
- `get_training_history`
- `get_weekly_schedule`
- `get_food_inventory`
- `get_nutrition_summary`
- `get_cgm_period_summary`
- `get_activity_summary`
- `draft_training_plan`
- `draft_meal_plan`
- `propose_schedule_changes`
- `save_user_note`

Las herramientas de escritura deben crear borradores o propuestas, no aplicar cambios silenciosamente. Validar todos los argumentos en backend. No dar al modelo SQL arbitrario ni acceso genérico a la base de datos.

### Salida estructurada
Usa schemas estrictos para:
- plan semanal;
- sesión de fuerza;
- sesión de carrera;
- receta;
- menú;
- lista de compra;
- resumen semanal;
- observación CGM;
- propuesta de cambio.
Cada respuesta debe incluir `assumptions`, `data_used`, `warnings`, `confidence`, `requires_user_approval` y `created_at` cuando corresponda.
Validar consistencia de cantidades, unidades, fechas, ingredientes, ejercicios y límites antes de guardar.

## 12. BASE DE DATOS Y MODELO DE DOMINIO

Diseña un modelo normalizado y versionado que cubra, como mínimo:
- UserProfile, Goals, Preferences, Consent.
- BodyMeasurement, WeightEntry, HabitEntry.
- Food, FoodSource, Recipe, RecipeIngredient, MealPlan, MealEntry, FoodLog, ShoppingList.
- Exercise, Equipment, MuscleGroup, WorkoutTemplate, WorkoutSession, ExerciseSet.
- EnduranceSession, ActivityRecord, DailyActivity, SleepRecord, RecoveryCheckIn.
- CGMImport, CGMReading, CGMMetricPeriod, GlucoseEvent, HealthEvent.
- IntegrationConnection, OAuthCredential, SyncJob, ImportJob, DataProvenance.
- AIConversation, AIProposal, AIUsageRecord, UserFeedback, AuditEvent.

Usa UUID/IDs estables, timestamps UTC y timezone original, unidades explícitas, índices adecuados, claves foráneas, borrado lógico solo donde tenga sentido y políticas de retención. No guardar secretos como texto plano.

Datos de salud: segregación lógica, autorización por usuario, cifrado en tránsito y reposo, backups cifrados y posibilidad de exportación/borrado. Diseñar desde el principio para minimizar datos y separar datos clínicos de telemetría técnica.

## 13. SEGURIDAD, PRIVACIDAD Y CUMPLIMIENTO

Analiza RGPD y normativa aplicable a datos de salud en la jurisdicción del usuario. No afirmes cumplimiento legal por tener una pantalla de consentimiento. La API de OpenAI no utiliza por defecto los datos enviados para entrenar modelos, pero existen registros de supervisión de abuso y retención de estado según endpoint/configuración; documentar la diferencia con precisión y comprobar las condiciones actuales antes de enviar datos CGM.
- Base jurídica y consentimiento explícito cuando corresponda.
- Finalidad y minimización.
- Derecho de acceso, portabilidad y supresión.
- Retención limitada y política documentada.
- Cifrado TLS, cifrado de datos sensibles y secretos en gestor de secretos.
- Control de acceso y sesiones seguras.
- CSRF/XSS/SQL injection, validación, rate limits y protección de subida de ficheros.
- Escaneo de PDFs/CSV, límites de tamaño y MIME real.
- Auditoría de acceso y exportación sin registrar contenido sensible.
- No enviar datos a analytics/terceros por defecto.
- Política clara sobre uso/retención de datos de API de OpenAI; revisar las condiciones actuales y ofrecer minimización/controles adecuados.
- No utilizar datos de salud para entrenamiento de modelos.
- Documentar amenazas y medidas mitigadoras.
- Si la app se distribuye o empieza a tomar decisiones clínicas, evaluar con asesoría especializada si entra en regulación de software como producto sanitario (MDR) y otros marcos. No presentarla como dispositivo médico.

## 14. DISEÑO VISUAL Y UX

Dirección visual: moderna, cálida, deportiva y clínica sin parecer un hospital. Alta calidad de producto, jerarquía clara, tipografía legible, gráficos útiles y densidad controlada.

- Responsive mobile-first.
- Tema claro/oscuro.
- Navegación simple.
- Componentes consistentes y design tokens.
- Tarjetas compactas; evitar dashboard sobrecargado.
- Gráficos con unidades, rangos, leyendas, tooltips y accesibilidad.
- Colores de glucosa comprensibles, pero nunca usar solo color para comunicar estados.
- Diferenciar datos medidos/importados/estimados.
- Estados vacíos útiles, skeletons, errores accionables.
- No utilizar imágenes de ejercicios genéricas que no correspondan al movimiento.
- Para ejercicios, preferir material visual realista y demostraciones correctas; si no hay imagen fiable, mostrar ilustración anatómica/diagrama etiquetado en vez de una foto engañosa.
- La app debe ser agradable de usar todos los días y rápida para registrar cosas.

## 15. TECNOLOGÍA Y CALIDAD

No impongas un stack sin auditar el existente. Mantén tecnología actual si es mantenible. Si hay que elegir:
- TypeScript end-to-end.
- Frontend moderno y responsive.
- Backend con API validada.
- PostgreSQL para persistencia.
- ORM y migraciones versionadas.
- Autenticación segura aunque inicialmente sea single-user.
- Gráficos accesibles.
- Tests unitarios, integración y E2E.
- Docker/devcontainer si ayuda a reproducibilidad.
- CI con lint, typecheck, tests, build y auditoría básica de dependencias.

No introduzcas microservicios prematuramente. Modular monolith con dominios separados suele ser preferible al inicio.

## 16. TESTS Y VALIDACIÓN

Añade tests específicos para:
- Conversión mg/dL ↔ mmol/L.
- TIR/TBR/TAR y CV con datasets de referencia.
- Lecturas duplicadas, timestamps, zonas horarias y huecos.
- Importación PDF/CSV corrupto o con columnas inesperadas.
- Cálculos nutricionales por ingrediente/ración.
- Diferencia peso crudo/cocinado.
- Conversión de unidades.
- Progresión de cargas y RIR.
- Planificación que evita conflictos y sesiones excesivas.
- Permisos y acceso entre usuarios.
- Protección de secretos.
- Bloqueo de cualquier intento de la IA de generar dosis de insulina o acciones clínicas.
- Respuestas inválidas de IA y fallos de proveedor.
- Exportación y borrado de datos.

Usa datos ficticios/sintéticos para pruebas. Nunca uses informes reales de salud en tests, fixtures públicos ni capturas.

## 17. FASES DE ENTREGA

No intentes construirlo todo de golpe sin validar. Diseña arquitectura completa desde el inicio, pero implementa en fases verticales utilizables.

### Fase 0 — Auditoría y arquitectura
Entregables: documentos, mapa del código actual, riesgos, arquitectura, modelo de datos, plan por hitos y decisiones tecnológicas. No romper la app existente.

### Fase 1 — Núcleo personal
Perfil, objetivos, dashboard, autenticación/seguridad, base de datos, registros de peso, actividad, comidas y entrenamiento. Migrar la app de gimnasio y conservar sus capacidades.

### Fase 2 — Entrenamiento completo
Biblioteca, rutinas, registro de series, carrera, ciclismo, cinta, planificación y progresión.

### Fase 3 — Nutrición
Base de alimentos, recetas, cálculo nutricional, menús, sustituciones, hidratos y lista de compra.

### Fase 4 — Diabetes/CGM
Importación manual LibreView/LibreLink, parser robusto, métricas CGM, AGP, anotaciones y visualización. Validación rigurosa con datos sintéticos y, posteriormente, un archivo real de prueba aportado por el usuario.

### Fase 5 — Integraciones
Polar AccessLink y evaluación/implementación de Health Connect según plataforma y permisos. No bloquear el producto si el acceso externo no está disponible.

### Fase 6 — IA
Asistente conversacional, propuestas estructuradas, resúmenes, menús y planificación adaptativa. Primero read-only, luego propuestas con aprobación.

### Fase 7 — Analítica y pulido
Revisión semanal, informes exportables, accesibilidad, rendimiento, privacidad, tests y documentación de despliegue.

Cada fase debe acabar con:
- funcionalidades operativas;
- migraciones y datos de ejemplo;
- tests;
- documentación actualizada;
- capturas o recorrido de la UI;
- lista de limitaciones;
- commit/checkpoint local;
- ninguna regresión en funciones anteriores.

## 18. CRITERIOS DE ACEPTACIÓN DEL PRODUCTO

La aplicación se considerará útil cuando pueda:

1. Crear y modificar una semana de entrenamiento.
2. Ejecutar una sesión de gimnasio registrando cada serie y carga.
3. Registrar una carrera, una salida en bici y caminatas en cinta.
4. Generar un menú semanal editable con cantidades e hidratos por comida.
5. Cambiar una comida por otra y recalcular lista de compra y valores nutricionales.
6. Registrar peso y visualizar tendencia.
7. Importar un informe CGM real compatible, mostrar periodo y calidad de datos, calcular métricas y presentar un AGP.
8. Superponer cronológicamente comidas/actividad/eventos con CGM.
9. Consultar al asistente sobre datos propios y recibir respuestas basadas en datos existentes.
10. Pedir una adaptación del día y recibir una propuesta explicada que el usuario pueda aceptar o rechazar.
11. Funcionar sin OpenAI y sin integraciones externas para el registro manual.
12. Exportar y borrar los datos personales.
13. No generar nunca dosis, cambios de insulina ni instrucciones terapéuticas.
14. Mostrar claramente qué es dato medido, importado, introducido, calculado o estimado.

## 19. PRIMERA TAREA QUE DEBES EJECUTAR AHORA

Empieza exclusivamente por la Fase 0:
- audita el proyecto;
- identifica la app de gimnasio existente y qué se puede reutilizar;
- comprueba el estado de Git;
- investiga documentación oficial actual de OpenAI API, Abbott/LibreView, Polar AccessLink, Android Health Connect y guías clínicas de diabetes/ejercicio;
- verifica qué integraciones son realmente posibles y cuáles no;
- redacta los documentos de arquitectura, riesgos, privacidad, modelo de datos y roadmap;
- presenta un resumen de hallazgos y una propuesta de implementación priorizada.

No empieces a implementar todas las funcionalidades antes de terminar la auditoría y acordar la arquitectura. No hagas preguntas sobre detalles que puedas descubrir inspeccionando el repositorio. Si necesitas una decisión que no puede deducirse, pregunta de forma concreta y agrupada.

**Calidad esperada:** producto personal de nivel profesional, no prototipo desechable. Prioriza robustez, seguridad, mantenibilidad, experiencia diaria y utilidad real por encima de añadir funciones llamativas.