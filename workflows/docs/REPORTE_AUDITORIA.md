# Auditoría Técnica de Refactorización

Este documento resume los cambios técnicos realizados en Abril 2026 para estabilizar y optimizar los flujos de CTT.

## Resumen de Cambios en `main.json` e `incidencias.json`:

### 1. Corrección de Mapeo de Gmail
- Se eliminaron los asuntos (subjects) fijos.
- Ahora todos los nodos de envío usan `{{ $json.email_subject }}`.

### 2. División de Nodos de Código (Moduralización)
Se dividieron los nodos gigantes en piezas más pequeñas para evitar errores de memoria y facilitar el debug:
- **Cálculo de Horas**: Nodo dedicado solo a la matemática de tiempos.
- **Preparación de Contexto**: Nodo dedicado a limpiar el texto para la IA.
- **Parseo de IA**: Nodo que procesa el JSON de respuesta.
- **Generador de Plantillas**: Nodo que aplica los textos finales (Hola/Buenos días).

### 3. Sistema de "Paracaídas" (SLA Override)
Se implementó una lógica determinista que garantiza la detección de incidencias:
- Si `horas_en_transito > 24` O `horas_en_reparto > 24`: Se genera alerta automática.
- Esto funciona incluso si la IA devuelve un error o decide no notificar erróneamente.

### 4. Implementación de Plantillas 2026
Se aplicaron las nuevas plantillas unificadas:
- Saludo interno: "Hola".
- Saludo externo (CTT): "Buenos días".
- Sin uso de la palabra "Estimados".

---
*Historial de scripts utilizados (en `scripts/tooling/`):*
* `transform_main.mjs`
* `transform_incidencias.mjs`
* `fix_templates.mjs`
* `verify_*.mjs`
