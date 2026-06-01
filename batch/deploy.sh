#!/usr/bin/env bash
# Despliegue del Cloud Run Job "ctt-batch" + Cloud Scheduler.
# Requiere: gcloud CLI autenticado (gcloud auth login) y proyecto ctt-dashboard.
# Ejecutar desde ctt-sauk/batch/.  NO commitea secretos: usa Secret Manager.
set -euo pipefail

PROJECT="ctt-dashboard"
REGION="europe-southwest1"          # Madrid (for Cloud Run Job)
SCHEDULER_REGION="europe-west1"     # Belgium (Cloud Scheduler is unsupported in europe-southwest1)
JOB="ctt-batch"
SA="ctt-batch-sa@${PROJECT}.iam.gserviceaccount.com"
SCHEDULER_JOB="ctt-batch-cron"

echo "==> Proyecto: $PROJECT  Región: $REGION"
gcloud config set project "$PROJECT"

# --- 1. Service Account del Job (una sola vez) ---
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create ctt-batch-sa --display-name "CTT Batch Job"
fi
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" --role "roles/datastore.user" --quiet
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" --role "roles/secretmanager.secretAccessor" --quiet

# --- 2. Crear secretos (una vez). Edita los valores antes de ejecutar. ---
# Patrón:  echo -n "VALOR" | gcloud secrets create NOMBRE --data-file=-
# Vuelve a versionar con:  echo -n "VALOR" | gcloud secrets versions add NOMBRE --data-file=-
#
#   OPENAI_API_KEY
#   CTT_HAMINOS_CLIENT_ID / _SECRET  (y SNAPPY, MIESTERY, KULTUDENDA)
#   GMAIL_HAMINOS_CLIENT_ID / _SECRET / _REFRESH_TOKEN  (y los otros 3)
#   FIREBASE_SERVICE_ACCOUNT  (contenido JSON de la service account)
#
# (Ver lista completa en README.md §Secretos)

# --- 3. Desplegar el Job desde el código fuente ---
gcloud run jobs deploy "$JOB" \
  --source . \
  --region "$REGION" \
  --service-account "$SA" \
  --task-timeout 3600 \
  --max-retries 1 \
  --memory 512Mi \
  --set-env-vars "DRY_RUN=false,SEND_EMAILS=true,BATCH_COLLECTION_SUFFIX=" \
  --set-secrets "\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
FIREBASE_SERVICE_ACCOUNT=FIREBASE_SERVICE_ACCOUNT:latest,\
CTT_HAMINOS_CLIENT_ID=CTT_HAMINOS_CLIENT_ID:latest,\
CTT_HAMINOS_CLIENT_SECRET=CTT_HAMINOS_CLIENT_SECRET:latest,\
CTT_SNAPPY_CLIENT_ID=CTT_SNAPPY_CLIENT_ID:latest,\
CTT_SNAPPY_CLIENT_SECRET=CTT_SNAPPY_CLIENT_SECRET:latest,\
CTT_MIESTERY_CLIENT_ID=CTT_MIESTERY_CLIENT_ID:latest,\
CTT_MIESTERY_CLIENT_SECRET=CTT_MIESTERY_CLIENT_SECRET:latest,\
CTT_KULTUDENDA_CLIENT_ID=CTT_KULTUDENDA_CLIENT_ID:latest,\
CTT_KULTUDENDA_CLIENT_SECRET=CTT_KULTUDENDA_CLIENT_SECRET:latest,\
GMAIL_HAMINOS_CLIENT_ID=GMAIL_HAMINOS_CLIENT_ID:latest,\
GMAIL_HAMINOS_CLIENT_SECRET=GMAIL_HAMINOS_CLIENT_SECRET:latest,\
GMAIL_HAMINOS_REFRESH_TOKEN=GMAIL_HAMINOS_REFRESH_TOKEN:latest,\
GMAIL_SNAPPY_CLIENT_ID=GMAIL_SNAPPY_CLIENT_ID:latest,\
GMAIL_SNAPPY_CLIENT_SECRET=GMAIL_SNAPPY_CLIENT_SECRET:latest,\
GMAIL_SNAPPY_REFRESH_TOKEN=GMAIL_SNAPPY_REFRESH_TOKEN:latest,\
GMAIL_MIESTERY_CLIENT_ID=GMAIL_MIESTERY_CLIENT_ID:latest,\
GMAIL_MIESTERY_CLIENT_SECRET=GMAIL_MIESTERY_CLIENT_SECRET:latest,\
GMAIL_MIESTERY_REFRESH_TOKEN=GMAIL_MIESTERY_REFRESH_TOKEN:latest,\
GMAIL_KULTUDENDA_CLIENT_ID=GMAIL_KULTUDENDA_CLIENT_ID:latest,\
GMAIL_KULTUDENDA_CLIENT_SECRET=GMAIL_KULTUDENDA_CLIENT_SECRET:latest,\
GMAIL_KULTUDENDA_REFRESH_TOKEN=GMAIL_KULTUDENDA_REFRESH_TOKEN:latest"

# --- 4. Cloud Scheduler: 17:00 y 20:00, L-V, hora de Madrid ---
SCHED_SA="ctt-scheduler@${PROJECT}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SCHED_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create ctt-scheduler --display-name "CTT Scheduler invoker"
fi
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SCHED_SA" --role "roles/run.invoker" --quiet

RUN_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run"
if gcloud scheduler jobs describe "$SCHEDULER_JOB" --location "$SCHEDULER_REGION" >/dev/null 2>&1; then
  ACTION="update"; else ACTION="create"; fi
gcloud scheduler jobs $ACTION http "$SCHEDULER_JOB" \
  --location "$SCHEDULER_REGION" \
  --schedule "0 17,20 * * 1-5" \
  --time-zone "Europe/Madrid" \
  --uri "$RUN_URI" \
  --http-method POST \
  --oauth-service-account-email "$SCHED_SA"

echo "==> Listo. Probar manualmente con:  gcloud run jobs execute $JOB --region $REGION"
