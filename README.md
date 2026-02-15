# Informe de Arquitectura y Optimización: Sistema de Tracking CTT (n8n)

Este documento detalla la re-ingeniería del sistema de seguimiento proactivo de CTT Express. El objetivo es lograr "Zero Blind Spots" y máxima eficiencia operativa en el seguimiento logístico de las 3 tiendas (Haminos, Kultudenda, Snappy).

---

## 1. Análisis de Evolución y Rendimiento

El sistema ha pasado de un modelo reactivo (allowlist) a uno proactivo (blocklist) con optimizaciones de rendimiento críticas.

| Característica | Estado Anterior (Deficiente) | Estado Actual (Optimizado) | Razón Técnica |
| :--- | :--- | :--- | :--- |
| **Filtro Ingress** | Allowlist (solo códigos conocidos). | **Blocklist:** Pasa todo excepto `2100`, `3000`, `2310`, `2500`. | **Integridad de Datos:** No se pierden estados nuevos o entregas en puntos. |
| **Cálculo SLA** | O(n horas) - Bucle hora a hora. | **O(n días) - Cálculo por bloques.** | **Rendimiento:** Reduce de 360 a 15 iteraciones para un paquete parado 15 días. |
| **API CTT** | Sin control de errores. | **Retry Protocols & Error Handling.** | **Fiabilidad:** Evita caídas del workflow si la API de CTT falla temporalmente. |
| **Tracking 1600** | Invisible (si no había _INCT). | **Captura en Historial Profundo.** | **Follow-up:** El fallo de reparto es ahora una incidencia de alta prioridad. |

---

## 2. Flujo Operativo Paso a Paso (Pipeline Trazable)

### Fase 1: Ingesta Multitienda (`main.json`)
El sistema recorre iterativamente los `client_center_code`. 
No usa credenciales dinámicas (limitación n8n), sino un loop por tienda.

### Fase 2: Filtro Eficiencia / Blocklist
Nodo **"Filtrar Estados Activos1"**. Excluimos estados finales para no procesar historial de paquetes ya concluidos.
```json
/* Configuración Blocklist (JSON) */
{
  "combinator": "and",
  "conditions": [
    { "operator": "notEquals", "rightValue": "2100" }, // Entregado
    { "operator": "notEquals", "rightValue": "3000" }, // Anulado
    { "operator": "notEquals", "rightValue": "2310" }, // Entregado Punto
    { "operator": "notEquals", "rightValue": "2500" }  // Devolución
  ]
}
```

### Fase 3: Captura de Historial y Enrutamiento
Se solicita el `shipping_history/events`. Un nodo **IF** decide:
- **Salida TRUE (Incidencia):** Si `incident_type_code` != null O el historial contiene `1600`.
- **Salida FALSE (Vigilancia):** Paquetes en tránsito normal sin alertas oficiales.

---

## 3. Lógica de Código Crítica (Performance & Logic)

### A. Algoritmo SLA Optimizado (O(n días))
Calcula las horas laborables (L-V) sin sobrecargar el motor de n8n.
```javascript
/* Nodo "Calc Horas" en estados.json */
function calcBusinessHours(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let totalHours = 0;
    let currentDay = new Date(start);
    currentDay.setHours(0, 0, 0, 0);
    
    while (currentDay <= end) {
        const dayOfWeek = currentDay.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // L-V
            const dayStart = Math.max(currentDay.getTime(), start.getTime());
            const dayEnd = Math.min(new Date(currentDay).setHours(23, 59, 59, 999), end.getTime());
            totalHours += (dayEnd - dayStart) / (1000 * 60 * 60);
        }
        currentDay.setDate(currentDay.getDate() + 1);
    }
    return Math.floor(totalHours);
}
```

### B. Reglas de Vigilancia (Regex Switch)
```regex
/* Switch Estados Cruce (Status,Hours) */
- Tránsito > 24h: /^(0700|0900|1000|1100|1200),(2[4-9]|[3-9]\d|\d{3,})$/
- Aduana > 24h:   /^(38\d{2}|3901|1700),(2[4-9]|[3-9]\d|\d{3,})$/
```

---

## 4. Matriz de Notificaciones (`follow-inc.json`)

| Alert Type | Status/Code | Email Content | Target | Escalation |
| :--- | :--- | :--- | :--- | :--- |
| **High Priority** | `6_INCT`, `8_INCT` | Reporte de Daños/Robo Grave. | CTT CCA | Inmediato |
| **Failed Delivery**| `1600`, `2_INCT` | Aviso Ausencia/Dirección mal. | Delegación | 3 Reintentos |
| **Stalled HUB** | SLA > 24h (Transit) | Consulta estado en HUB parado. | Delegación | Escalado al 3er día |

---

## 5. Diccionario de Códigos y Protocolos de Error

### **Protocolo de Fiabilidad (HTTP Requests)**
Para evitar pérdida de datos por caídas de API CTT, todos los nodos HTTP deben tener activado:
- **Retry on Fail:** true (3 intentos)
- **Wait between:** 5000ms
- **Timeout:** 30s

### **Diccionario de Estados (Resumen)**
- **1600:** Reparto Fallido (Tratado como incidencia aunque sea un estado estándar).
- **2310 / 2500:** Estados finales añadidos a la blocklist actual.
- **38XX:** Códigos de Aduana (incluyen 1030_INCT).

---

## 6. Roadmap de Mantenibilidad (Sprint Backlog)

1.  **Caché con TTL:** Implementar Redis o Google Sheets para no pedir el historial de un paquete parado cada 30 minutos.
2.  **Externalización de Reglas:** Mover los umbrales de SLA (24h, 72h) y los códigos a una hoja de Google Sheets para que el equipo logístico pueda editarlos sin tocar n8n.
3.  **Logging & Data Studio:** Guardar cada ejecución en Sheets para monitorizar la performance de CTT en tiempo real.

---

> [!IMPORTANT]
> Esta arquitectura está optimizada para procesar altos volúmenes de pedidos minimizando el tiempo de CPU en n8n y garantizando que ningún "reparto fallido" quede sin su correspondiente reclamación.
