# Migración del batch CTT (n8n → Cloud Run Job)

> Objetivo: mover el workflow pesado `main.json` de n8n a un **Cloud Run Job** en
> TypeScript, dentro del monorepo del dashboard. Ganar **velocidad** (paralelismo
> + escrituras batch) y **observabilidad** (Cloud Logging estructurado).
> El `manual-refresh.json` se queda donde está (ya tiene equivalente en
> `dashboard/src/app/api/test/refresh-tracking/route.ts`).

---

## 1. Entender la lógica actual (mapa del `main.json`)

Flujo completo del workflow `Schedule Trigger` (17:00 y 20:00, L–V):

```
Schedule Trigger
  → Edit Fields (daysRange=30, pageLimit=20)
  → [x4 credenciales en paralelo] Token CTT → Config Centers → Call SubWf (paginación)
       SubWf: por cada centro → leer página 1 → detectar última página
               → leer resto de páginas → acumular envíos
  → Merge2 (junta los 4 clientes)
  → Code: Enriquecer Cliente   (añade client_name, internal_email, cca_zone)
  → Filter: Estados Activos    (descarta terminales 2000/2100/2300/2310/3000 salvo multi-bulto)
  → Loop: Un envío a la vez  ◀──────────── CUELLO DE BOTELLA (secuencial)
       └ Set Variables → Firestore: Buscar Incidencia Previa
         → Code: Preparar Contexto (skip / force_internal / numero_avisos)
         → IF ¿Ya procesado hoy? ── sí → trace skipped_processed_today
                                  └ no → Expandir Bultos
            → Validate Tokens → Resolve Token
            → HTTP: Historial Bulto (1 request POR bulto, secuencial, retry x10)
            → Extraer Historial → Filtrar Bultos Activos
            → IF ¿Bultos Activos? ── no → trace skipped_all_terminal_bultos
                                   └ sí → Calcular Horas Fase → Calcular SLA Horas
               → AI: Analizar Historiales (gpt-4o-mini)
               → Parsear y Override IA  (override matemático SLA, fuente de verdad)
               → Procesar Respuesta IA  (plantillas email, target_type, reincidencia)
               → IF ¿Debe Notificar? ── sí → Switch Email Routing → Gmail Send/Draft (x4 clientes x2 modos)
                                      └ no → trace ai_no_notify
               → ¿Es Incidencia Real? → Registrar Incidencia (Firestore PATCH)
               → Preparar Log → Body Log → Log Ejecucion (Firestore PATCH)
```

### Reglas de negocio clave (no perder en la migración)
- **Estados terminales**: `2000, 2100, 2300, 2310, 3000`. Se filtran salvo multi-bulto.
- **Códigos incidencia activa**: `1600, 2400, 2600, 2700, 0600`; resolución: `1500, 2000, 2100`.
- **Umbrales SLA**: manifest/transit/delivery/stationary > 24h (delegación destino [1200] > 48h).
- **Override matemático manda sobre la IA** (`Code: Parsear y Override IA`): la IA decide,
  pero si un umbral se rompe, se fuerza incidencia. Esto es la "fuente de verdad".
- **skip**: si `fecha_procesado == hoy` y `estado` no cambió (y no es 2500) → no reprocesar.
- **force_internal**: si se procesó ayer o es 2500 y el estado sigue problemático.
- **Reincidencia**: si `numero_avisos > 0` y el target era `standard` → se escala a `internal`
  con prefijo `[RE-INCIDENCIA]`.
- **Routing email**: `internal` → `internalEmail` del cliente; `standard` → `cca_zone`.
  Modo `Send` vs `Draft` según cliente (en n8n hay ambos; ver nota §6).
- **Colecciones Firestore**: `incidencias`, `ejecuciones`, `trazabilidad_ejecuciones`.

### Routing Draft vs Interno (CONFIRMADO — replicar EXACTO)
Regla de notificación, idéntica a la actual (`Code: Procesar Respuesta IA` + `Switch: Email Routing`):

- **Primer aviso, tipos "a CTT"** (`agilizar_reparto`, `agilizar_transito`, `segundo_intento`,
  `punto_ctt`, `recogida_fallida`, `recogida_0030`) → `target_type = standard` →
  **Gmail Draft** dirigido a la `cca_zone` del cliente (`cca.z2/z3@cttexpress.com`),
  creado en la **cuenta Gmail de cada cliente**.
- **Reincidencia** (`numero_avisos > 0` y era `standard`) → escala a `target_type = internal`
  → **Gmail Send** real al `internalEmail`, asunto con prefijo `[RE-INCIDENCIA]`.
- **Excepciones que van a interno desde el PRIMER aviso** (se mantienen, NO se unifican):
  `pendiente` (0000), `devolucion` (2500), `siniestro` (1006/1008/1012) →
  `target_type = internal` → **Gmail Send** directo al `internalEmail`.

Mapeo del Switch (por cliente): `*_standard → Gmail Draft`, `*_internal → Gmail Send`.
En `gmail.ts` esto se traduce a dos operaciones de la Gmail API:
`drafts.create` (standard) vs `messages.send` (internal), usando las credenciales OAuth2
del cliente correspondiente.

### Lo que YA está portado a TS (reutilizable tal cual)
`dashboard/src/app/api/test/refresh-tracking/route.ts` ya contiene:
`getAccessToken`, `fetchShippingHistory`, `calculateSLAFases`, `callOpenAI`
(con el system prompt completo), los overrides SLA, `TEMPLATES`, `CLIENTS`,
y el armado de `logData` / `incidenciaData`. **Falta**: el listado paginado de
envíos (subworkflow) y el envío real de Gmail (ahora escribe en colecciones `_test`).

---

## 2. Arquitectura destino

```
Cloud Scheduler (cron "0 17,20 * * 1-5", TZ Europe/Madrid)
      │  OIDC → invoca el Job
      ▼
Cloud Run Job  "ctt-batch"   (Node 20, TS compilado)
      │   Secret Manager: CTT secrets, OPENAI_API_KEY, FIREBASE_SERVICE_ACCOUNT, Gmail creds
      │   Service Account con roles/datastore.user + secretAccessor
      ▼
Firestore (ctt-dashboard)  +  Gmail API  +  Cloud Logging (structured logs)
```

- **Cloud Run *Job*** (no Service): no expone puerto, corre hasta acabar, timeout hasta 24h.
- **Cloud Scheduler** dispara el Job (target: Cloud Run Admin API `:run`).
- **Concurrencia** dentro del proceso con `p-limit` (10–20) → de 1h a minutos.
- **Escrituras Firestore en batch** (`db.batch()`, máx 500 ops/batch).

---

## 3. Estructura de archivos (monorepo, mismo repo que el dashboard)

```
ctt-sauk/
  dashboard/                 # Next.js existente (sin cambios funcionales)
  batch/                     # ◀ NUEVO — el Cloud Run Job
    package.json             # deps: firebase-admin, p-limit, (googleapis para Gmail)
    tsconfig.json
    Dockerfile
    src/
      index.ts               # entrypoint del Job: orquesta todo y hace process.exit
      config/
        clients.ts           # CLIENTS (extraído de route.ts / firebase.ts)
        constants.ts         # TERMINAL/INCIDENT/RESOLUTION codes, umbrales
      lib/
        ctt.ts               # getAccessToken, listShipments (paginación), fetchHistory
        sla.ts               # calculateSLAFases  (copiar de route.ts)
        ai.ts                # callOpenAI + system prompt (copiar de route.ts)
        decision.ts          # overrides SLA + plantillas + target_type + reincidencia
        firestore.ts         # init admin, buscar previa, batch writers, trace
        gmail.ts             # envío real (googleapis + OAuth2 por cliente)
        logger.ts            # log estructurado JSON → Cloud Logging
      pipeline.ts            # processShipment(shipment) → 1 envío de principio a fin
```

> **Mejor aún**: extraer la lógica común a `dashboard/src/lib/ctt-core/` e importarla
> tanto desde `route.ts` (manual) como desde `batch/` (cron). Así no se duplica el prompt
> ni las plantillas. Decidir según cuánto cueste configurar paths del monorepo.

---

## 4. El cambio de fondo: secuencial → paralelo

El `Loop: Un envío a la vez` de n8n procesa 1 envío cada vez. En TS:

```ts
import pLimit from 'p-limit';
const limit = pLimit(15);                       // 15 envíos a la vez

const shipments = await listAllShipments();     // todos los clientes/centros/páginas
const results = await Promise.all(
  shipments.map(s => limit(() => processShipment(s)))
);

// Escrituras agrupadas en vez de 1 PATCH por envío
await flushFirestoreBatches(results);           // db.batch(), trozos de 500
```

`processShipment` replica el camino interno del loop:
buscar previa → preparar contexto (skip/force_internal) → si no skip:
fetch historial de bultos **en paralelo** (otro `p-limit`) → SLA → IA → override →
plantilla → decidir notificar → (enviar Gmail) → devolver registros para batch-write.

**Impacto estimado**: con >1000 envíos, pasar de secuencial (~1h) a 15 en paralelo
≈ 5–10 min, limitado sobre todo por OpenAI y rate limits de CTT (ajustar concurrencia).

---

## 5. Observabilidad (lo que pediste)

- `logger.ts` emite **JSON estructurado** a stdout; Cloud Run lo manda a Cloud Logging.
  Cada línea con: `severity`, `shipping_code`, `client`, `fase_salida`, `razon`, `ms`.
  ```ts
  console.log(JSON.stringify({ severity:'INFO', shipping_code, client, fase_salida, razon }));
  ```
- En Cloud Logging filtras: `jsonPayload.fase_salida="error"` o por `shipping_code`.
- **Log de resumen final** por ejecución: total, notificados, skipped, errores, duración.
- Mantener `trazabilidad_ejecuciones` en Firestore (ya existe) para el dashboard.
- Opcional: **alerta** en Cloud Monitoring si `severity=ERROR` supera N, o si el Job falla.

---

## 6. Decisiones a cerrar antes de codear

1. **Gmail**: en n8n usa credenciales OAuth2 por cliente (Send vs Draft). Para Cloud Run
   hay que portar esos refresh tokens a Secret Manager y usar `googleapis`. ¿Mantener
   modo *Draft* para algún cliente o todos *Send*? (revisar qué hace hoy cada uno).
2. **Secretos**: hoy los `client_secret` de CTT están **hardcodeados** en los JSON y en
   `firebase.ts`. En la migración van a **Secret Manager** (y conviene rotarlos, ya que
   han estado en texto plano).
3. **Reutilizar `ctt-core` compartido** vs **copiar a `batch/`**. Recomendado: compartido.
4. **Colección destino**: el batch escribe en `incidencias`/`ejecuciones` reales (no `_test`).
5. **daysRange/pageLimit**: hoy 30 días / 20 por página. ¿Mantener?

---

## 7. Plan por fases (incremental, verificable)

**Fase 0 — Andamiaje** (sin tocar n8n)
- Crear `batch/` con `package.json`, `tsconfig`, `Dockerfile`, `index.ts` "hola mundo".
- `npm run build` local + `docker build` ok.

**Fase 1 — Listado de envíos** (porta el subworkflow de paginación)
- `lib/ctt.ts`: `listShipments(client, center, daysRange, pageLimit)` con paginación
  (página 1 → leer `pagination.page_offsets.last` → resto en paralelo).
- Test: imprime nº de envíos por cliente y compara con una ejecución de n8n.

**Fase 2 — Pipeline por envío** (porta el interior del loop)
- Reutiliza `calculateSLAFases`, `callOpenAI`, overrides y plantillas de `route.ts`.
- Añade `buscar incidencia previa`, `skip`, `force_internal`, `numero_avisos`.
- Test: corre 5–10 envíos reales con Gmail DESACTIVADO (dry-run), compara decisión
  (`should_notify`, `notification_type`) contra lo que hizo n8n.

**Fase 3 — Escrituras Firestore en batch**
- `firestore.ts`: agrupar incidencias + ejecuciones + trazabilidad en `db.batch()`.
- Test: verificar docs en colecciones reales (o `_batch_test` primero).

**Fase 4 — Gmail real**
- `gmail.ts` con OAuth2 por cliente desde Secret Manager. Flag `DRY_RUN=true` por defecto.
- Test: enviar a una dirección de prueba antes de apuntar a clientes/CCA.

**Fase 5 — Concurrencia + logging estructurado**
- Meter `p-limit`, log JSON, resumen final. Medir duración.

**Fase 6 — Empaquetado y despliegue**
- `gcloud run jobs deploy ctt-batch --source batch/ --region europe-southwest1 \
   --set-secrets ... --service-account ...`
- Secret Manager: crear secretos y dar `roles/secretmanager.secretAccessor` a la SA.
- SA con `roles/datastore.user`.

**Fase 7 — Scheduler y corte**
- `gcloud scheduler jobs create http ctt-batch-cron --schedule "0 17,20 * * 1-5" \
   --time-zone "Europe/Madrid" --uri ".../jobs/ctt-batch:run" --oauth-service-account-email ...`
- Correr en paralelo a n8n unos días (n8n con Gmail en Draft o desactivado) y comparar
  `trazabilidad_ejecuciones`. Cuando cuadre → **desactivar el Schedule Trigger de n8n**.

---

## 7-bis. ESTADO DE LA IMPLEMENTACIÓN (actualizado)

Código en `ctt-sauk/batch/` (compila y probado contra CTT + Firestore reales):

| Fase | Estado | Notas |
|------|--------|-------|
| 0 Andamiaje | ✅ | package.json, tsconfig, Dockerfile, .dockerignore |
| 1 Listado paginado | ✅ verificado | 2.788 envíos / 751 activos en ~8s |
| 2 Pipeline por envío | ✅ verificado | SLA+IA+override+routing; IA pendiente de OPENAI_API_KEY |
| 3 Escrituras Firestore batch | ✅ verificado | escribe en `*_batch_test`; DRY_RUN por defecto |
| 4 Gmail Draft/Send | ✅ código listo | `gmail.ts`; seguro tras `SEND_EMAILS`; falta refresh_token por cliente |
| 5 Concurrencia + logs | ✅ | p-limit(15), logs JSON estructurados |
| 6 Despliegue | ✅ script | `deploy.sh` + `README.md`; falta ejecutar con gcloud |
| 7 Scheduler + corte n8n | ⏳ | dentro de deploy.sh; pendiente de validación paralela |

**Pendiente manual del usuario:**
1. `OPENAI_API_KEY` para validar decisiones contra n8n.
2. Gmail por cliente: `client_id`, `client_secret` y `refresh_token`
   (este último con `get-gmail-token.mjs` si solo hay id+secret).
3. `gcloud` instalado para `deploy.sh`; rotar `CTT_*` secrets.

## 8. Riesgos y mitigaciones
- **Rate limits CTT / OpenAI**: ajustar `p-limit`; mantener retries con backoff (ya existe).
- **Diferencias de forma en respuesta CTT** (el bug de bultos del manual-refresh): usar
  la extracción robusta de `route.ts` (`shipping_history` puede ser objeto o array).
- **Doble notificación** durante el solapamiento n8n+batch: por eso Fase 7 usa dry-run/Draft.
- **Idempotencia**: respetar `skip` por `fecha_procesado==hoy` para no duplicar avisos.
- **Secretos en texto plano hoy**: rotarlos al migrarlos a Secret Manager.

---

## 9. Coste estimado
- Cloud Run Job: ~44 ejecuciones/mes × pocos min → **dentro de capa gratuita (~0 €)**.
- Cloud Scheduler: 1 job → gratis (3 primeros gratis).
- OpenAI + Firestore: igual que hoy (no cambia con la migración).
- Probable **ahorro** vs VPS de n8n parado el 90% del día.
```
