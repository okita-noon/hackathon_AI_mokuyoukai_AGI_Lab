# AIおかん — AI木曜会 / AGI Lab

**公開環境**: [AIおかん](https://commitpay-agi-lab-921302036612.asia-northeast1.run.app)（Cloud Run / asia-northeast1）

過去の行動パターンを読んだ「AIおかん」と約束を結び、写真・動画の証拠を提出するハッカソン向けアプリです。`ai-okan/` がデプロイ対象で、API RouteからVertex AIと既存のCloud SQLへ接続します。

[google-mini-hackathon](https://github.com/okita-noon/google-mini-hackathon) のコミット [`cb04df5`](https://github.com/okita-noon/google-mini-hackathon/commit/cb04df585fa1b6897ca99b0502d51db5ce553076) をベースに、このリポジトリで独立して実行できるよう移植しています。

## ローカル起動

Node.js 22.9 以上、npm、Docker Compose が必要です。

```bash
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:migrate
cd ai-okan
npm ci
DATABASE_URL=postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いて「過去のデータを渡す」から進みます。

`ai-okan/.env.local` の `GOOGLE_API_KEY` または `GEMINI_API_KEY` を設定するとGeminiを利用します。Vertex AIでは `USE_VERTEX=1` と `GOOGLE_CLOUD_PROJECT` を設定します。AI未設定や呼び出し失敗時は固定応答のデモモードに切り替わります。

約束、判定ログ、期限切れ時のモック罰金、画面の復元状態はPostgreSQLに保存します。提出した画像・動画そのものは保存せず、重複判定用のハッシュとメタデータを残します。

DB はこのプロジェクト専用の Compose ボリュームを使い、`localhost:55432/commitpay_agi_lab` で接続します。元リポジトリの DB とポート・データを分けています。`db:migrate` と `tick` も `.env` を読み込みます。設定変更後は開発サーバーを再起動してください。

## 画面とAPI

| パス | 内容 |
|---|---|
| `/` | 過去データ、見立て、約束、監視の4ステップ |
| `/api/okan` | 状態復元、見立て生成、約束・期限切れの記録 |
| `/api/verify` | 写真・動画のAI判定と判定ログ保存 |
| `/api/health` | Cloud SQL接続とAIエンジンの稼働確認 |

## 開発・デモ

```bash
cd ai-okan
npm run typecheck
npm run lint
npm test
npm run build
```

認証は固定デモユーザーです。期限切れボタンは実課金を行わず、既存バックエンドの `penalty_transactions` に `MOCKED` として記録します。

## 構成

- Next.js 16 App Router / React / TypeScript
- PostgreSQL 16
- Vertex AI / Gemini API / OpenAI（未設定時はデモ応答）
- Cloud Run / Cloud SQL

AIおかん固有の設計とデモ手順は [ai-okan/README.md](ai-okan/README.md) と [ai-okan/DEMO.md](ai-okan/DEMO.md) を参照してください。ルートの旧CommitPay実装はDBスキーマ、マイグレーション、スケジューラーの共有バックエンドとして残しています。

## CI/CD

[GitHub Actions](https://github.com/okita-noon/hackathon_AI_mokuyoukai_AGI_Lab/actions/workflows/ci-cd.yml) で次を実行します。

- **main 向け PR**: 依存関係のインストール、型検査、PostgreSQL 16 へのスキーマ適用・再適用、`tests/*.test.ts` があればテスト、本番 Docker イメージのビルド。
- **main への push（PR マージを含む）**: 同じ検証に成功した `ai-okan/` のイメージを Artifact Registry に保存し、本番 DB のスキーマ適用 → Cloud Run の新リビジョン作成 → `/api/health` でDB接続確認 → トラフィック切り替え。
- **手動実行**: Actions の `Run workflow` で `main` を選択。ほかのブランチでは検証だけ実行します。

デプロイ先は `ai-lab-okita2026` / `asia-northeast1` / `commitpay-agi-lab`。既存の環境変数・Secret Manager 参照・Cloud SQL 接続・実行サービスアカウントは維持します。リクエストタイムアウトは動画判定に合わせて 300 秒を設定します。イメージはコミット SHA で識別し、Actions の実行サマリーに公開 URL とリビジョンを記録します。

main のパイプラインを直列化し、実行中のデプロイは新しい push で中断しません。GitHub Actions は待機中の実行を最新の実行に置き換えるため、連続 push は最新の main に集約される場合があります。古いコミットの再実行もデプロイ直前に除外します。

### 初回の認証設定

既存の GCP 環境と、IAM を設定できる `gcloud` 認証、リポジトリ変数を変更できる `gh` 認証が必要です。

```bash
bash infra/setup-ci.sh
```

専用のデプロイ用サービスアカウント、Artifact Registry、Workload Identity Federation を作成し、GitHub Actions の次の **Variables** を登録します。

| Variable | 内容 |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | 作成した OIDC Provider の完全なリソース名 |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `commitpay-agi-lab-deploy@ai-lab-okita2026.iam.gserviceaccount.com` |

認証はこのリポジトリの ID・所有者 ID・main・対象ワークフロー・イベント種別に限定します。サービスアカウントの JSON キーは登録しません。方式の詳細は [Google の認証 Action](https://github.com/google-github-actions/auth) を参照してください。

デプロイ用アカウントに付与する権限は次のとおりです。

| 対象 | IAM ロール |
|---|---|
| Cloud Run `commitpay-agi-lab` | `roles/run.developer` |
| Artifact Registry `commitpay-agi-lab` | `roles/artifactregistry.writer` |
| 実行用アカウント `commitpay-agi-lab-run` | `roles/iam.serviceAccountUser` |
| Secret `commitpay-agi-lab-db-password` | `roles/secretmanager.secretAccessor` |
| プロジェクト `ai-lab-okita2026` | `roles/cloudsql.client`、`roles/serviceusage.serviceUsageConsumer` |

さらに、条件に一致する GitHub OIDC 主体へ、デプロイ用アカウントの `roles/iam.workloadIdentityUser` を付与します。

### デプロイ失敗時

検証やスキーマ適用が失敗した場合、サービスのイメージは更新しません。新リビジョンの起動に失敗した場合も、既存リビジョンのトラフィックを維持します。切り替え後の HTTP 確認失敗は Actions に失敗として表示されます（自動ロールバックは行いません）。

以前のリビジョンへ戻す場合は、Cloud Run のリビジョン一覧で対象を確認して実行します。

```bash
gcloud run revisions list --service commitpay-agi-lab --project ai-lab-okita2026 --region asia-northeast1
gcloud run services update-traffic commitpay-agi-lab --project ai-lab-okita2026 --region asia-northeast1 --to-revisions=REVISION_NAME=100
```

スキーマは自動では戻りません。`db/schema.sql` の変更は再実行でき、稼働中の旧アプリとも互換性を保つ形にしてください。通常のコード更新では以下の初期構築スクリプトを実行する必要はありません。

## GCP 初期構築・インフラ設定

```bash
PROJECT_ID=ai-lab-okita2026 ./infra/deploy.sh
```

デプロイ先は GCP の AI Lab（`ai-lab-okita2026`）です。Cloud Run、Cloud SQL、Cloud Storage、Cloud Scheduler、Secret Manager を作成します。デフォルトのサービス名は `commitpay-agi-lab` で、関連リソース名もこの接頭辞を使用します。元の `commitpay` サービスとは別のリソースになります。必要に応じて `SERVICE` を変更できます。

Cloud SQL Auth Proxy は macOS / Linux の arm64 / amd64 に対応します。GCP の認証・権限・課金設定が別途必要です。公開環境は Vertex AI を利用し、Stripe は未設定のためモック決済です。Cloud Scheduler が5分ごとに期限切れを処理します。
