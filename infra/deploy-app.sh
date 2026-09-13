#!/usr/bin/env bash
# Update the existing service; infrastructure provisioning stays in deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PROJECT_ID:?PROJECT_ID is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-commitpay-agi-lab}"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID" CLOUDSDK_CORE_DISABLE_PROMPTS=1
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE}/${SERVICE}:${GITHUB_SHA}"

# A rerun of an old workflow must not roll production back.
MAIN_SHA="$(gh api "repos/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}/git/ref/heads/main" --jq .object.sha)"
if [ "$MAIN_SHA" != "$GITHUB_SHA" ]; then
  echo 'A newer commit exists on main; skipping this outdated deployment.'
  exit 0
fi

# Refuse to create a new service with missing runtime configuration.
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(metadata.name)'
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker tag commitpay:ci "$IMAGE"
docker push "$IMAGE"
bash infra/migrate-cloud.sh
# --timeout は動画判定（アップロード確認 → Gemini の前処理 → 解析）に必要な長さ。
# GCS_BUCKET は動画の直接アップロード先。未設定だと動画は 8MB の base64 経路に落ちるため、
# 毎回同じ値を入れ直す（--update-env-vars は指定した変数だけを更新する）。
# ほかの環境変数・シークレット・接続設定は既存のまま維持する。
gcloud run services update "$SERVICE" --region "$REGION" \
  --image "$IMAGE" --timeout 300 --no-traffic --tag candidate \
  --update-env-vars "GCS_BUCKET=${PROJECT_ID}-${SERVICE}-proofs" \
  --update-labels "commit-sha=${GITHUB_SHA}"
REVISION="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.latestReadyRevisionName)')"
CANDIDATE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.traffic[?tag=candidate].url)')"
test -n "$CANDIDATE_URL"
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 --max-time 30 \
  "${CANDIDATE_URL}/api/health" >/dev/null
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions="${REVISION}=100"
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 --max-time 30 \
  "${URL}/api/health" >/dev/null
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf 'Deployed `%s` to [%s](%s)\n\nRevision: `%s`\n' "$GITHUB_SHA" "$SERVICE" "$URL" "$REVISION" >> "$GITHUB_STEP_SUMMARY"
fi
