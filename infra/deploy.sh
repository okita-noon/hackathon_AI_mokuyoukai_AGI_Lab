#!/usr/bin/env bash
# CommitPay の初期インフラを作成・設定する。通常の更新は CI/CD に任せる。
#   PROJECT_ID=xxx ./infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="${PROJECT_ID:?PROJECT_ID を指定してください}"
REGION="${REGION:-asia-northeast1}"
VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"   # Gemini のモデル可用性が高いリージョン
SERVICE="${SERVICE:-commitpay-agi-lab}"
SQL_INSTANCE="${SERVICE}-db"
DB_NAME="commitpay_agi_lab"
DB_USER="commitpay"
BUCKET="gs://${PROJECT_ID}-${SERVICE}-proofs"
SA="${SERVICE}-run@${PROJECT_ID}.iam.gserviceaccount.com"

# この実行だけ対象プロジェクトを固定し、ユーザーの既定設定は変更しない。
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

echo "==> 1/8 API有効化"
gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com aiplatform.googleapis.com \
  storage.googleapis.com cloudscheduler.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com

echo "==> 2/8 サービスアカウント"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${SERVICE}-run" --display-name "CommitPay Cloud Run"
for ROLE in roles/aiplatform.user roles/cloudsql.client roles/storage.objectAdmin \
            roles/secretmanager.secretAccessor roles/iam.serviceAccountTokenCreator; do
  # 作成直後のサービスアカウントが IAM に反映されるまで再試行する。
  for ATTEMPT in 1 2 3 4 5 6; do
    if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member "serviceAccount:${SA}" --role "$ROLE" --condition=None >/dev/null; then
      break
    fi
    if [ "$ATTEMPT" -eq 6 ]; then exit 1; fi
    sleep 5
  done
done

echo "==> 3/8 Cloud SQL（初回は約8分）"
# 初回作成の途中で中断しても、同じ認証情報で再開できるよう先に保存する。
if gcloud secrets describe "${SERVICE}-db-password" >/dev/null 2>&1; then
  DB_PASS="$(gcloud secrets versions access latest --secret="${SERVICE}-db-password")"
else
  DB_PASS="$(openssl rand -hex 24)"
  printf '%s' "$DB_PASS" | gcloud secrets create "${SERVICE}-db-password" --data-file=- >/dev/null
fi
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION" \
    --storage-size=10 --storage-type=HDD --no-backup --edition=enterprise
fi
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 || \
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
if [ -z "$(gcloud sql users list --instance="$SQL_INSTANCE" --filter="name=$DB_USER" --format='value(name)')" ]; then
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS"
fi
CONN_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
# Cloud Run からは Cloud SQL コネクタの UNIX ソケット経由で繋ぐ
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${CONN_NAME}"

echo "==> 4/8 Cloud Storage"
gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access
# ブラウザから署名付きURLへ直接PUTするために CORS が必要
gcloud storage buckets update "$BUCKET" --cors-file=infra/cors.json

echo "==> 5/8 シークレット"
put_secret () { # name value
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null
  else
    printf '%s' "$2" | gcloud secrets create "$1" --data-file=- >/dev/null
  fi
}
# CRON_SECRET は既存があれば使い回す（毎回作り直すと Scheduler とズレる）
if [ -z "${CRON_SECRET:-}" ]; then
  CRON_SECRET="$(gcloud secrets versions access latest --secret=${SERVICE}-cron-secret 2>/dev/null || openssl rand -hex 16)"
fi
put_secret "${SERVICE}-database-url" "$DATABASE_URL"
put_secret "${SERVICE}-cron-secret"  "$CRON_SECRET"

# Cloud Run に渡すシークレット。Stripe キーは未設定ならぶら下げない
# （Secret Manager は空ペイロードを受け付けず、参照するとデプロイも失敗するため）
RUN_SECRETS="DATABASE_URL=${SERVICE}-database-url:latest,CRON_SECRET=${SERVICE}-cron-secret:latest"
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
  put_secret "${SERVICE}-stripe-key" "$STRIPE_SECRET_KEY"
  RUN_SECRETS="${RUN_SECRETS},STRIPE_SECRET_KEY=${SERVICE}-stripe-key:latest"
else
  echo "    STRIPE_SECRET_KEY 未設定 → ペナルティ決済は MOCKED で記録されます"
fi

echo "==> 6/8 スキーマ適用（Cloud SQL Auth Proxy 経由）"
PROJECT_ID="$PROJECT_ID" SERVICE="$SERVICE" bash infra/migrate-cloud.sh

echo "==> 7/8 Cloud Run デプロイ"
gcloud run deploy "$SERVICE" \
  --source . --region "$REGION" --allow-unauthenticated \
  --service-account "$SA" \
  --add-cloudsql-instances "$CONN_NAME" \
  --memory 1Gi --cpu 1 --timeout 300 --max-instances 5 \
  --set-env-vars "USE_VERTEX=1,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${VERTEX_LOCATION},STORAGE_DRIVER=gcs,GCS_BUCKET=${PROJECT_ID}-${SERVICE}-proofs,JUDGE_MODEL=${JUDGE_MODEL:-gemini-2.5-flash},ARBITER_MODEL=${ARBITER_MODEL:-gemini-2.5-pro},DESIGNER_MODEL=${DESIGNER_MODEL:-gemini-2.5-flash},GRACE_PERIOD_HOURS=${GRACE_PERIOD_HOURS:-24}" \
  --set-secrets "$RUN_SECRETS"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"

echo "==> 8/8 Cloud Scheduler（5分おきに猶予期限をスイープ）"
# create と update でヘッダのフラグ名が違う（update は --update-headers）
if gcloud scheduler jobs describe "${SERVICE}-tick" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SERVICE}-tick" \
    --location "$REGION" --schedule "*/5 * * * *" \
    --uri "${URL}/api/cron/tick" --http-method POST \
    --update-headers "x-cron-secret=${CRON_SECRET}" \
    --attempt-deadline 300s --format='value(name)'
else
  gcloud scheduler jobs create http "${SERVICE}-tick" \
    --location "$REGION" --schedule "*/5 * * * *" \
    --uri "${URL}/api/cron/tick" --http-method POST \
    --headers "x-cron-secret=${CRON_SECRET}" \
    --attempt-deadline 300s --format='value(name)'
fi

echo
echo "✅ デプロイ完了: $URL"
