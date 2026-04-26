# Changelog - CTT Workflows

## [2026-04-23]
### Mejoras de Resiliencia y Logging (CTT Main)

#### 🛡️ Robustez ante errores API (Bad Gateway 502)
- **HTTP: Historial Bulto**: Actualizado a version 4.2 y configurado con `onError: continueRegularOutput`. 
    - Ahora el flujo no se detiene si la API de CTT falla después de agotar reintentos.
    - Incrementado a **10 reintentos** con **15 segundos** de espera.
- **Nodos de Token**: Añadidos **5 reintentos** automáticos (5s delay) a todos los nodos de autenticación (HAMINOS, MIESTERY, KULTUDENDA, SNAPPY).

#### 📊 Mejoras en el Registro (Firestore)
- **Log de Estados Terminales**: Modificada la lógica en el nodo `Set: Preparar Log` para asegurar que los envíos en estado "Entregado" (que no pasan por la IA) guarden correctamente su historial en los campos `bultos_historial_json` y `historial_formateado`.

#### 📧 Limpieza de Comunicaciones
- **Plantillas de Email**: Eliminada la cadena redundante `"--- MENSAJE ORIGINAL ---"` de los cuerpos de mensaje en casos de re-incidencia, logrando una comunicación más profesional y limpia.
