# ctt-batch — Cloud Run Job

Reemplazo del workflow pesado `main.json` de n8n. Revisa los envíos de los 4
clientes, decide con IA + reglas SLA, y crea draft / envía email según la lógica
de siempre. Escribe en Firestore (`incidencias`, `ejecuciones`, `trazabilidad_ejecuciones`).

## Ejecutar en local

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # si node no está en PATH
npm install
npm run build

# Dry-run (NO escribe, NO envía) — lo más seguro:
node dist/index.js

# Solo unos pocos envíos por cliente:
LIMIT=5 node dist/index.js
```

### Variables de entorno

| Var | Default | Efecto |
|-----|---------|--------|
| `DRY_RUN` | `true` | `false` → escribe en Firestore |
| `SEND_EMAILS` | (vacío) | `true` → crea drafts / envía emails de verdad |
| `BATCH_COLLECTION_SUFFIX` | `_batch_test` | sufijo de colecciones; `""` = producción |
| `LIMIT` | `0` | procesa solo N envíos activos por cliente (pruebas) |
| `OPENAI_API_KEY` | — | sin ella, decide solo el override SLA |
| `FIREBASE_SERVICE_ACCOUNT` | — | JSON SA; si falta usa `../scripts/config/serviceAccountKey.json` |

**Combinaciones seguras de prueba:**
- `LIMIT=5` → dry-run total.
- `DRY_RUN=false LIMIT=5` → escribe en `*_batch_test`, sin emails.
- `DRY_RUN=false SEND_EMAILS=true BATCH_COLLECTION_SUFFIX=_batch_test LIMIT=2` → emails reales + test collections.
- **Producción**: `DRY_RUN=false SEND_EMAILS=true BATCH_COLLECTION_SUFFIX=` (vacío).

## Secretos (Secret Manager)

Crear con `echo -n "VALOR" | gcloud secrets create NOMBRE --data-file=-`:

- `OPENAI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (JSON entero de la service account)
- `CTT_<CLIENTE>_CLIENT_ID` / `CTT_<CLIENTE>_CLIENT_SECRET` × {HAMINOS, SNAPPY, MIESTERY, KULTUDENDA}
- `GMAIL_<CLIENTE>_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` × los 4 clientes

> Los `CTT_*` ya existen hardcodeados en el código como fallback; conviene
> rotarlos y meterlos aquí. Los `GMAIL_*_REFRESH_TOKEN` se obtienen con el helper.

## Obtener el refresh_token de Gmail (si solo tienes id + secret)

```bash
node get-gmail-token.mjs <CLIENT_ID> <CLIENT_SECRET>
```
Abre una URL, das consentimiento con la cuenta del cliente (la que manda los
emails), pegas el código y te imprime el `refresh_token`. Repetir por cada cliente.
La cuenta de Google Cloud del OAuth client debe tener habilitada la **Gmail API**
y el `redirect_uri` `http://localhost` autorizado.

## Desplegar

```bash
bash deploy.sh           # crea SA, despliega Job y Scheduler (17:00 y 20:00 L-V)
gcloud run jobs execute ctt-batch --region europe-southwest1   # ejecución manual
```

## Logs

Cloud Logging, filtrando por:
- `jsonPayload.fase_salida="error"` → fallos
- `jsonPayload.shipping_code="..."` → un envío concreto
- `jsonPayload.message="Batch CTT finalizado"` → resumen de cada ejecución
