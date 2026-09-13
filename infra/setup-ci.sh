#!/usr/bin/env bash
# One-time (rerunnable) setup. Requires gcloud/gh login with IAM/repo admin rights.
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-ai-lab-okita2026}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-commitpay-agi-lab}"
REPOSITORY="okita-noon/hackathon_AI_mokuyoukai_AGI_Lab"
POOL="commitpay-github"
PROVIDER=github
DEPLOY_SA="${SERVICE}-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
RUN_SA="${SERVICE}-run@${PROJECT_ID}.iam.gserviceaccount.com"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID" CLOUDSDK_CORE_DISABLE_PROMPTS=1
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(metadata.name)'
REPO_ID="$(gh api "repos/${REPOSITORY}" --jq .id)"
OWNER_ID="$(gh api "repos/${REPOSITORY}" --jq .owner.id)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com artifactregistry.googleapis.com
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${SERVICE}-deploy" --display-name 'CommitPay GitHub deployment'
gcloud artifacts repositories describe "$SERVICE" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$SERVICE" --location "$REGION" --repository-format=docker
gcloud artifacts repositories add-iam-policy-binding "$SERVICE" --location "$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" --role=roles/artifactregistry.writer >/dev/null
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" --role=roles/run.developer >/dev/null
for ROLE in roles/cloudsql.client roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}" --role="$ROLE" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:${DEPLOY_SA}" --role=roles/iam.serviceAccountUser >/dev/null
gcloud secrets add-iam-policy-binding "${SERVICE}-db-password" \
  --member="serviceAccount:${DEPLOY_SA}" --role=roles/secretmanager.secretAccessor >/dev/null
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name='CommitPay GitHub'
# IDs prevent repository-name reuse; only this workflow on main may impersonate.
CONDITION="assertion.repository_id == '${REPO_ID}' && assertion.repository_owner_id == '${OWNER_ID}' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '${REPOSITORY}/.github/workflows/ci-cd.yml@refs/heads/main' && assertion.event_name in ['push', 'workflow_dispatch']"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --workload-identity-pool="$POOL" --location=global >/dev/null 2>&1; then
  VERB=update-oidc
else
  VERB=create-oidc
fi
gcloud iam workload-identity-pools providers "$VERB" "$PROVIDER" \
  --workload-identity-pool="$POOL" --location=global \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition="$CONDITION"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository_id/${REPO_ID}" >/dev/null
WIF="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$REPOSITORY" --body "$WIF"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "$REPOSITORY" --body "$DEPLOY_SA"
echo 'CI authentication configured. Merge .github/workflows/ci-cd.yml into main to activate.'
