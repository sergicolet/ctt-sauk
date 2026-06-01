# PowerShell version of deploy.sh for Windows
# Run from ctt-sauk/batch/

$ErrorActionPreference = "Stop"

$PROJECT = "ctt-dashboard"
$REGION = "europe-southwest1"          # Madrid (for Cloud Run Job)
$SCHEDULER_REGION = "europe-west1"     # Belgium (Cloud Scheduler is unsupported in europe-southwest1)
$JOB = "ctt-batch"
$SA = "ctt-batch-sa@${PROJECT}.iam.gserviceaccount.com"
$SCHEDULER_JOB = "ctt-batch-cron"


Write-Host "==> Proyecto: $PROJECT  Región: $REGION"
gcloud config set project "$PROJECT"

# --- 1. Service Account del Job (una sola vez) ---
Write-Host "==> Comprobando Service Account para el Job..."
$saJobExists = $false
try {
    $null = gcloud iam service-accounts describe $SA --quiet 2>&1
    if ($LASTEXITCODE -eq 0) { $saJobExists = $true }
} catch {
    # SA does not exist or command failed
}

if (-not $saJobExists) {
    Write-Host "Creando Service Account ctt-batch-sa..."
    gcloud iam service-accounts create ctt-batch-sa --display-name "CTT Batch Job" --quiet
}


Write-Host "Asignando roles a la Service Account..."
gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$SA" --role "roles/datastore.user" --quiet
gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$SA" --role "roles/secretmanager.secretAccessor" --quiet

# --- 3. Desplegar el Job desde el código fuente ---
Write-Host "==> Desplegando el Cloud Run Job '$JOB'..."
gcloud run jobs deploy $JOB `
  --source . `
  --region "$REGION" `
  --service-account "$SA" `
  --task-timeout 3600 `
  --max-retries 1 `
  --memory 512Mi `
  --set-env-vars "DRY_RUN=false,SEND_EMAILS=true,BATCH_COLLECTION_SUFFIX=" `
  --set-secrets "OPENAI_API_KEY=OPENAI_API_KEY:latest,FIREBASE_SERVICE_ACCOUNT=FIREBASE_SERVICE_ACCOUNT:latest,CTT_HAMINOS_CLIENT_ID=CTT_HAMINOS_CLIENT_ID:latest,CTT_HAMINOS_CLIENT_SECRET=CTT_HAMINOS_CLIENT_SECRET:latest,CTT_SNAPPY_CLIENT_ID=CTT_SNAPPY_CLIENT_ID:latest,CTT_SNAPPY_CLIENT_SECRET=CTT_SNAPPY_CLIENT_SECRET:latest,CTT_MIESTERY_CLIENT_ID=CTT_MIESTERY_CLIENT_ID:latest,CTT_MIESTERY_CLIENT_SECRET=CTT_MIESTERY_CLIENT_SECRET:latest,CTT_KULTUDENDA_CLIENT_ID=CTT_KULTUDENDA_CLIENT_ID:latest,CTT_KULTUDENDA_CLIENT_SECRET=CTT_KULTUDENDA_CLIENT_SECRET:latest,GMAIL_HAMINOS_CLIENT_ID=GMAIL_HAMINOS_CLIENT_ID:latest,GMAIL_HAMINOS_CLIENT_SECRET=GMAIL_HAMINOS_CLIENT_SECRET:latest,GMAIL_HAMINOS_REFRESH_TOKEN=GMAIL_HAMINOS_REFRESH_TOKEN:latest,GMAIL_SNAPPY_CLIENT_ID=GMAIL_SNAPPY_CLIENT_ID:latest,GMAIL_SNAPPY_CLIENT_SECRET=GMAIL_SNAPPY_CLIENT_SECRET:latest,GMAIL_SNAPPY_REFRESH_TOKEN=GMAIL_SNAPPY_REFRESH_TOKEN:latest,GMAIL_MIESTERY_CLIENT_ID=GMAIL_MIESTERY_CLIENT_ID:latest,GMAIL_MIESTERY_CLIENT_SECRET=GMAIL_MIESTERY_CLIENT_SECRET:latest,GMAIL_MIESTERY_REFRESH_TOKEN=GMAIL_MIESTERY_REFRESH_TOKEN:latest,GMAIL_KULTUDENDA_CLIENT_ID=GMAIL_KULTUDENDA_CLIENT_ID:latest,GMAIL_KULTUDENDA_CLIENT_SECRET=GMAIL_KULTUDENDA_CLIENT_SECRET:latest,GMAIL_KULTUDENDA_REFRESH_TOKEN=GMAIL_KULTUDENDA_REFRESH_TOKEN:latest" `
  --quiet

# --- 4. Cloud Scheduler ---
Write-Host "==> Comprobando Service Account para el Scheduler..."
$SCHED_SA = "ctt-scheduler@${PROJECT}.iam.gserviceaccount.com"
$saExists = $false
try {
    $null = gcloud iam service-accounts describe $SCHED_SA --quiet 2>&1
    if ($LASTEXITCODE -eq 0) { $saExists = $true }
} catch {
    # SA does not exist or command failed
}

if (-not $saExists) {
    Write-Host "Creando Service Account ctt-scheduler..."
    gcloud iam service-accounts create ctt-scheduler --display-name "CTT Scheduler invoker" --quiet
}

gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$SCHED_SA" --role "roles/run.invoker" --quiet

$RUN_URI = "https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run"

Write-Host "==> Comprobando si el Job de Scheduler ya existe..."
$jobExists = $false
try {
    $null = gcloud scheduler jobs describe $SCHEDULER_JOB --location "$SCHEDULER_REGION" --quiet 2>&1
    if ($LASTEXITCODE -eq 0) { $jobExists = $true }
} catch {
    # Job does not exist or command failed
}

if ($jobExists) {
    $ACTION = "update"
    Write-Host "Actualizando Job de Scheduler..."
} else {
    $ACTION = "create"
    Write-Host "Creando Job de Scheduler..."
}


gcloud scheduler jobs $ACTION http $SCHEDULER_JOB `
  --location "$SCHEDULER_REGION" `
  --schedule "0 17,20 * * 1-5" `
  --time-zone "Europe/Madrid" `
  --uri "$RUN_URI" `
  --http-method POST `
  --oauth-service-account-email "$SCHED_SA" `
  --quiet

Write-Host "==> Listo. Probar manualmente con:  gcloud run jobs execute $JOB --region $REGION"
