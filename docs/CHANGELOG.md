# CTT Dashboard — Registro de Cambios y Pendientes

## Contexto general

El sistema tiene tres partes:
- **`workflows/main.json`** — Workflow n8n que corre a las 17h y 20h (L-V). Llama a la API CTT, analiza historiales con GPT-4o-mini, y decide si enviar email/borrador. Escribe en las colecciones `ejecuciones` e `incidencias` de Firestore.
- **`workflows/manual-refresh.json`** — Webhook que actualiza el tracking de un envío concreto desde el botón del dashboard. Solo actualiza `estado`, `bultos_historial_json`, `fecha_procesado` y `razon`. **No ejecuta lógica de email.**
- **`dashboard/`** — Next.js app que lee Firestore y muestra los datos.

---

## Cambios aplicados

### 1. Dashboard — Infinite scroll no funcionaba (`EjecucionesTable.tsx`)

**Problema:** El `IntersectionObserver` se adjuntaba en el primer render cuando no había datos y el sentinel (`hasMore=false`) no estaba en el DOM. Cuando los datos cargaban y `hasMore` pasaba a `true`, el efecto no se re-ejecutaba porque `handleIntersect` (su única dependencia) era estable. El spinner "Cargando más..." aparecía permanentemente sin cargar nada.

**Fix:** Mover el cálculo de `sorted`, `visible` y `hasMore` antes del `useEffect`, y añadir `hasMore` como dependencia. Así cuando `hasMore` cambia a `true`, el efecto se re-ejecuta y adjunta el observer al sentinel que ya está en el DOM.

```tsx
// Antes
useEffect(() => { ... }, [handleIntersect]);

// Después
useEffect(() => {
  if (!hasMore) return;
  ...
}, [handleIntersect, hasMore]);
```

---

### 2. Dashboard — Query Firestore excluía documentos por tipo mixto (`page.tsx`)

**Problema:** El query usaba `orderBy("fecha_procesado", "desc")`. En Firestore, cuando hay documentos con `fecha_procesado` como `Timestamp` (docs nuevos) y otros como `string` (docs antiguos en formato `DD-MM-YYYY` o con sufijos como `"(Manual)"`), Firestore los ordena por tipo antes que por valor. Los strings van antes que los Timestamps en orden descendente, lo que desplazaba documentos KULTUDENDA (fechas antiguas en formato `"16-04-2026"`) a posiciones >100 en el resultado. Con el infinite scroll roto, nunca aparecían.

**Fix:** Eliminar el `orderBy` del query. El sort ya lo hace el cliente con `parseFecha()` que maneja todos los formatos correctamente. Se mantiene el `limit(1000)`.

```js
// Antes
getDocs(query(collection(db, "ejecuciones"), orderBy("fecha_procesado", "desc"), limit(1000)))

// Después
getDocs(query(collection(db, "ejecuciones"), limit(1000)))
```

---

### 3. Dashboard — `parseProcessDate` fallaba con formato ISO (`page.tsx`)

**Problema:** La función asumía siempre formato `DD-MM-YYYY`. Para fechas en formato ISO `2026-04-18 01:33:11` parseaba `d=2026, m=4, y=18` → `new Date(18, 3, 2026)` (año 18 d.C.). Esto rompía el filtro por fecha del calendario.

**Fix:** Detectar el formato por el valor del primer segmento: si es >31, es YYYY-MM-DD.

```js
const parseProcessDate = (dateStr: string) => {
  const datePart = dateStr.split(' ')[0];
  const segments = datePart.split('-').map(Number);
  if (segments[0] > 31) return new Date(segments[0], segments[1] - 1, segments[2]); // ISO
  return new Date(segments[2], segments[1] - 1, segments[0]); // Legacy DD-MM-YYYY
};
```

---

### 4. Dashboard — Estado `"0020"` sin label ni tema (`status-map.ts`)

**Problema:** Documentos KULTUDENDA guardaban el estado `"0020"` (variante del `"20"` = "En proceso"). El mapa solo tenía `"20"`, así que el badge mostraba el código crudo.

**Fix:** Añadir `"0020"` a `STATUS_LABELS` y `STATUS_THEMES` con los mismos valores que `"20"`.

---

### 5. Workflow — Estado `2500` (devolución) no generaba alerta interna (`main.json`)

**Problema:** En `Code: Parsear y Override IA`, la variable `stateIsStillProblematic` no incluía el estado `2500`. Aunque `Code: Preparar Contexto` siempre pone `force_internal=true` para envíos en devolución, la condición `(force_internal && stateIsStillProblematic)` fallaba porque `stateIsStillProblematic` era `false`. Resultado: `should_notify=false`, sin email.

**Fix:** Añadir `is2500` a `stateIsStillProblematic` y al bloque de asignación de `notification_type`.

```js
const is2500 = estado_actual === '2500';
const stateIsStillProblematic = isDelivery || isStationary || is2500 || is71INAT || sla.has_active_incident;
// ...
else if (is2500) notification_type = 'devolucion';
```

El template `devolucion` ya existía en `Code: Procesar Respuesta IA` y genera alerta interna con asunto "Devolución en proceso: XXXX".

---

### 6. Workflow — Estado `71_INAT` no generaba borrador (`main.json`)

**Problema:** `71_INAT` ("Entrega día siguiente por fecha de compromiso expirada") no estaba en ninguna lista de estados que dispararan notificación. CTT compromete reentrega al día siguiente pero el sistema no alertaba.

**Fix:** Añadir `is71INAT` como condición explícita que siempre dispara notificación (sin umbral de horas, ya que el compromiso de CTT es suficiente motivo).

```js
const is71INAT = estado_actual === '71_INAT';
// En el if principal:
is71INAT  // ← siempre notifica
// En notification_type:
else if (is71INAT) notification_type = 'agilizar_reparto';
```

El template `agilizar_reparto` genera un borrador a CTT solicitando que saquen el envío a reparto.

---

## Pendiente

### P1 — `manual-refresh.json`: añadir lógica de email
El refresh manual actualiza el tracking pero no re-evalúa si hay que enviar email. Casos afectados: envíos que pasaron a `1600` después de que el auto-workflow ya los procesó (con estado anterior sin incidencia).

**Lo que hay que hacer:** Después de obtener el historial de CTT, añadir los mismos nodos de cálculo SLA + decisión que tiene `main.json`, y si corresponde, enviar email/borrador y actualizar `email_enviado`, `tipo_email`, `asunto`, `cuerpo`, `destinatario` en Firestore.

---

### P2 — Punto CTT: mostrar dirección del punto de recogida en el dashboard
Cuando el estado es `2300` o `2310`, el envío está en un Punto CTT. La dirección del punto (nombre, calle, CP) no se guarda en Firestore.

**Lo que hay que hacer:**
1. **Workflow:** Cuando `estado=2300` o `estado=2310`, llamar al endpoint `[POST] CTT PUDO Points` (documentado en `CTT Api Rest - Last Mile (Most Usual Api)/3. [POST] CTT PUDO Points/`). Guardar en Firestore los campos `punto_ctt_nombre` y `punto_ctt_direccion`.
2. **Dashboard:** Mostrar estos campos en el panel de detalle del envío cuando existan.

---

### P3 — `estado` guardado como integer en manual-refresh
El nodo Firestore de n8n auto-convierte strings numéricos a integer (ej: `"1600"` → `1600`). Esto ocurre en `manual-refresh.json` al escribir el campo `estado`. En el dashboard no causa problemas de visualización (el código hace `String(estado)`), pero puede afectar condiciones en el workflow si algún nodo hace comparación estricta de tipo.

**Lo que hay que hacer:** En el nodo `Update Firestore` de `manual-refresh.json`, o bien prefijar el estado con un carácter no numérico y normalizar después, o bien escribir el campo estado con un campo separado de tipo string explícito.

---

## Notas de arquitectura

- `numero_avisos`: counter de alertas enviadas para un envío. Si es >100 se considera corrupto (bug antiguo de concatenación) y se sanea con `raw_avisos.length`.
- La IA (GPT-4o-mini) decide `notification_type` pero el código en `Code: Parsear y Override IA` puede **sobrescribir** esa decisión si las horas SLA superan umbrales matemáticos. Esto evita falsos negativos de la IA.
- Los emails `standard` (borrador a CTT) se convierten en `internal` automáticamente si `numero_avisos > 0` — el segundo aviso siempre va al equipo interno con prefijo `[RE-INCIDENCIA]`.
- `force_internal=true` cuando la fecha del documento en Firestore es de ayer o el estado es 2500. Sirve para re-procesar envíos del día anterior que siguen con incidencia.
