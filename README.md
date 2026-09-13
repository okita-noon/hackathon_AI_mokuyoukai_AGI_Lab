# CommitPay — AI木曜会 / AGI Lab

**公開環境**: [CommitPay](https://commitpay-agi-lab-921302036612.asia-northeast1.run.app)（Cloud Run / asia-northeast1）

目標を宣言し、写真・動画・音声・位置情報の証跡を提出すると、Gemini が達成状況を判定するハッカソン向けアプリです。動画は尺と解析範囲を明示したうえでフレーム単位で確認します。未達時は猶予期間と異議申し立てを経て、Stripe のペナルティ処理を行います。

[google-mini-hackathon](https://github.com/okita-noon/google-mini-hackathon) のコミット [`cb04df5`](https://github.com/okita-noon/google-mini-hackathon/commit/cb04df585fa1b6897ca99b0502d51db5ce553076) をベースに、このリポジトリで独立して実行できるよう移植しています。

## ローカル起動

Node.js 22.9 以上、npm、Docker Compose が必要です。

```bash
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:migrate
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いて「はじめる」から進みます。別のアプリが 3000 番を使用中なら `npm run dev -- --port 3001` を指定してください。

`.env` の `GOOGLE_API_KEY` を設定すると、AI による目標のヒアリング・条件提案・証拠判定・異議申し立ての再判定が使えます。Vertex AI を使う場合は `USE_VERTEX=1`、`GOOGLE_CLOUD_PROJECT` を設定し、`gcloud auth application-default login` を実行します。キー未設定では画面や一覧は開けますが、AI を使う目標作成フローと判定は完了できません。

Stripe キー未設定では実際の決済をせず、ペナルティを `MOCKED` として記録します。カード登録を試す場合は Stripe のテスト用シークレットキーと公開キーを両方設定してください。ローカルの証跡は `.data/uploads/` に保存します。

DB はこのプロジェクト専用の Compose ボリュームを使い、`localhost:55432/commitpay_agi_lab` で接続します。元リポジトリの DB とポート・データを分けています。`db:migrate` と `tick` も `.env` を読み込みます。設定変更後は開発サーバーを再起動してください。

## 画面と機能

| パス | 内容 |
|---|---|
| `/` | スタートページ |
| `/app` | 目標作成、コミットメント一覧、証跡提出、判定・異議申し立て |
| `/mypage` | 信頼スコア、支払先の設定、カード登録、決済履歴 |
| `/debug` | 判定 JSON の確認、ワーカーの手動実行 |

AI が推奨した証跡とは別の種類でも提出できます。判定が不確実な場合は `UNCERTAIN` とし、そのまま猶予期限を迎えた場合は免責します。

### 動画の証跡

動画は撮影・選択したあとプレビューで中身を確認してから提出します。アップロードは Cloud Storage への直接 PUT で、進捗を表示します。1 ファイル 200MB まで、AI が解析するのは先頭 10 分までです（超える場合は提出前に画面へ表示します）。60 秒以下の動画は 2 コマ/秒、それより長い動画は 1 コマ/秒でサンプリングします。

Vertex AI（`USE_VERTEX=1`）では `gs://` の URI をそのまま渡すため、動画本体はアプリを経由しません。`GOOGLE_API_KEY` 方式では Gemini の Files API へアップロードし、解析可能になるまで待ってから判定します。ローカル保存（`STORAGE_DRIVER=local`）でも同じ経路で判定できます。詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

## 開発・デモ

```bash
npm run typecheck
npm run build
npm start                 # http://localhost:8080
npm run tick             # 締切超過・猶予切れを1回処理
```

デモで猶予を短縮するには `.env` の `GRACE_PERIOD_HOURS=0.01`（36秒）を設定します。ローカルでは自動実行のスケジューラーは起動しないので、`npm run tick` または `/debug` のボタンで処理を進めてください。

認証は参照元と同じ固定デモユーザーです。寄付・友人への支払先は希望の記録のみで、第三者への送金は実装していません。

## 構成

- Next.js App Router / React / TypeScript
- PostgreSQL 16
- Gemini API または Vertex AI
- ローカルファイル保存 または Cloud Storage
- Stripe（未設定時はモック）

設計の詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、参照元の開発時の分担・API 契約は [docs/HANDOFF.md](docs/HANDOFF.md) を参照してください。

## CI/CD

[GitHub Actions](https://github.com/okita-noon/hackathon_AI_mokuyoukai_AGI_Lab/actions/workflows/ci-cd.yml) で次を実行します。

- **main 向け PR**: 依存関係のインストール、型検査、PostgreSQL 16 へのスキーマ適用・再適用、`tests/*.test.ts` があればテスト、本番 Docker イメージのビルド。
- **main への push（PR マージを含む）**: 同じ検証に成功したイメージを Artifact Registry に保存し、本番 DB のスキーマ適用 → Cloud Run の新リビジョン作成 → トラフィック切り替え → HTTP 確認。
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
