# Importar un PDF de LibreLink / LibreView

En **Glucosa → Importar**, selecciona el informe PDF exportado por LibreLink/LibreView. Revisa el periodo, los rangos y las métricas reconocidas; confirma para verlo en **Resumen**, en el informe para consulta y en las herramientas del asistente (con el consentimiento de glucosa).

El formato AGP ES/EN con texto seleccionable se lee en el navegador, sin enviar el documento a un servidor ni a la IA. Se localiza la página AGP incluso en informes de varias páginas (máximo 60 páginas y 10 MB). Los rangos son los publicados en el PDF; cambiar los rangos de Ajustes no recalcula sus porcentajes. No se mezclan periodos ni se confunden objetivos terapéuticos o percentiles del gráfico con resultados.

Se conservan las métricas presentes: tiempos en rangos, glucosa media, GMI, coeficiente de variación y tiempo con sensor activo. No se completan los campos ausentes con ceros. Las cifras contradictorias o porcentajes incoherentes se omiten con un aviso. El mismo archivo no se vuelve a importar por duplicado (hash SHA-256). Si hay varios informes AGP en un archivo se avisa y se lee el primero: importa un periodo por archivo.

Las gráficas diarias, los máximos/mínimos horarios y las curvas AGP no son las lecturas originales. No se reconstruyen a partir de ellas muestras, episodios ni asociaciones con comidas o ejercicio. Las vistas que necesitan lecturas individuales siguen usando los CSV. Las métricas del PDF siempre muestran el periodo original, incluso cuando se piden resúmenes de otro número de días.

Opcionalmente se guarda el PDF original cifrado en este dispositivo. Se puede descargar desde Resumen o borrar desde Importaciones. El original no se sincroniza; las métricas y los metadatos del informe usan la sincronización opcional habitual. El asistente recibe solo campos agregados conocidos, sin el nombre del archivo, el texto íntegro, las gráficas ni información de tratamiento del PDF.

Los PDF escaneados, protegidos por contraseña o con una estructura diferente pueden no ser reconocidos. La app avisa y no guarda un documento sin métricas. El reconocimiento de imágenes/OCR no está implementado en este importador.

Verificación: parser probado con un informe real facilitado por el usuario (sin incorporarlo al repositorio). Pruebas versionadas con datos sintéticos: ES/EN, unidades, objetivos frente a resultados, páginas, fechas, incoherencias, persistencia, cifrado, duplicados, borrado y acceso agregado del asistente. E2E genera un PDF sintético con el AGP en la página 12 y recorre la importación, resumen, descarga del original, reimportación, informe para consulta e Inicio.
