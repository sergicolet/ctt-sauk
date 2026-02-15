# Guía de Implementación: Tracking CTT Proactivo + IA

Esta guía detalla los pasos exactos para actualizar tus workflows de n8n e integrar la capa de Inteligencia Artificial.

---

## 🛠️ Paso 1: Actualizar `main.json` (Filtros e Ingesta)

1.  **Sustituir Filtro:** Busca el nodo "Filtrar Estados Activos1" y sustitúyelo por la lógica de **Blocklist** (ver `main_logic.json`). Asegúrate de añadir `2310` y `2500` para evitar procesar entregas en puntos y devoluciones.
2.  **Nodo IF de Enrutamiento:** Inserta un nodo **IF** después de pedir el historial.
    - **Condición:** `item.incident_type_code` no está vacío **Ó** `history_has_1600` es true.
    - **TRUE:** Conecta al sub-workflow `incidencias.json`.
    - **FALSE:** Conecta al sub-workflow `estados.json`.

---

## 🛠️ Paso 2: Nuevos Sub-workflows AI-First (`estados.json` / `incidencias.json`)

Hemos eliminado la lógica manual de "Calc Horas" para dejar que la IA sea la que decida basándose en el historial completo.

1.  **Entrada de Datos:** El sub-workflow recibe el JSON completo desde `main.json` (incluyendo el `status_history`).
2.  **Nodo IA (Brain Node):** 
    - Inserta el **Nodo IA** al principio del sub-workflow.
    - Configúralo con el nuevo `AI_SYSTEM_MESSAGE.md`.
    - Pásale la variable `$now` (fecha actual).
3.  **Nodo IF Post-IA:** Mira el resultado `{{ $json.decision.should_notify }}`.
    - Si es `false`: Termina el flujo.
    - Si es `true`: Pasa al siguiente paso.
4.  **Nodo Switch de Ramas:** 
    - Configura el Switch para leer el campo **`{{ $json.decision.target_branch }}`** que genera la IA.
    - Las ramas deben ser: `SINIESTRO`, `DIRECCION`, `REPARTO`, `TRANSITO`.
5.  **Envío (Gmail):** Conecta cada salida del Switch a su respectivo nodo Gmail.

---

## 🛠️ Paso 3: Resumen de Variables IA para el Switch

La IA ahora exporta las variables exactas para que n8n no tenga que hacer cálculos complejos:

- **Variable:** `target_branch` -> Define el camino en el Switch.
- **Variable:** `justification` -> Debe ir al log de Google Sheets para auditoría.
- **Variable:** `priority` -> Puedes usarla para decidir si envías el correo con importancia "Alta".

---

## 🛠️ Paso 4: Actualizar `follow-inc.json` (Acción)

1.  **Google Sheets de Auditoría:** Asegúrate de que el log incluya la **justificación de la IA** (`analysis.final_reason`). Así sabrás por qué se envió cada correo.
2.  **Reintentos HTTP:** Entra en cada nodo "HTTP Request" (Token, Active Shipments, History) y activa el **Retry on Fail** (3 intentos, 5s de espera).

---

## 📊 Resumen de Ubicación de Códigos

| Elemento | Ubicación en Disco | Dónde ponerlo en n8n |
| :--- | :--- | :--- |
| **Filtros / IF** | `/optimized/main_logic.json` | `main.json` |
| **Cálculo SLA** | `/optimized/estados_logic.json` | `estados.json` -> Nodo Code |
| **Lógica IA** | `/optimized/ai_node_structure.json` | Antes de los nodos Gmail |
| **Cerebro IA** | `AI_SYSTEM_MESSAGE.md` | Configuración System Prompt del nodo IA |

---

> [!TIP]
> Te recomiendo testear primero el nodo de IA con un pedido que se haya movido hace poco (falso positivo) para verificar que `should_notify` devuelva `false` con la justificación correcta.
