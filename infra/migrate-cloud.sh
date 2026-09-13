#!/usr/bin/env bash
# Apply schema using the existing DB credentials and a short-lived SQL proxy.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PROJECT_ID:?PROJECT_ID is required}"
SERVICE="${SERVICE:-commitpay-agi-lab}"
PROXY_PORT="${PROXY_PORT:-5433}"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID" CLOUDSDK_CORE_DISABLE_PROMPTS=1
case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) PLATFORM=linux.amd64 ;;
  Linux/aarch64|Linux/arm64) PLATFORM=linux.arm64 ;;
  Darwin/arm64) PLATFORM=darwin.arm64 ;;
  Darwin/x86_64) PLATFORM=darwin.amd64 ;;
  *) echo 'Unsupported Cloud SQL Auth Proxy platform' >&2; exit 1 ;;
esac
WORK_DIR="$(mktemp -d)"
PROXY_PID=''
cleanup() {
  if [ -n "$PROXY_PID" ]; then kill "$PROXY_PID" 2>/dev/null || true; wait "$PROXY_PID" 2>/dev/null || true; fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT
curl -fsSL --retry 3 -o "$WORK_DIR/cloud-sql-proxy" \
  "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.${PLATFORM}"
chmod +x "$WORK_DIR/cloud-sql-proxy"
CONN_NAME="$(gcloud sql instances describe "${SERVICE}-db" --format='value(connectionName)')"
# CI uses ADC emitted by google-github-actions/auth. Local use keeps gcloud login.
AUTH_ARGS=()
if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then AUTH_ARGS+=(--gcloud-auth); fi
"$WORK_DIR/cloud-sql-proxy" ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "$CONN_NAME" --address 127.0.0.1 --port "$PROXY_PORT" &
PROXY_PID=$!
READY=0
for _ in $(seq 30); do
  kill -0 "$PROXY_PID" 2>/dev/null || { echo 'Cloud SQL proxy exited' >&2; exit 1; }
  if nc -z 127.0.0.1 "$PROXY_PORT"; then READY=1; break; fi
  sleep 1
done
[ "$READY" -eq 1 ] || { echo 'Cloud SQL proxy did not become ready' >&2; exit 1; }
DB_PASS="$(gcloud secrets versions access latest --secret="${SERVICE}-db-password")"
if [ "${GITHUB_ACTIONS:-}" = true ]; then printf '::add-mask::%s\n' "$DB_PASS"; fi
export DATABASE_URL="postgresql://commitpay:${DB_PASS}@127.0.0.1:${PROXY_PORT}/commitpay_agi_lab"
npm run db:migrate
