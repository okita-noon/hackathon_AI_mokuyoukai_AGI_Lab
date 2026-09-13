# CommitPay — AI木曜会 / AGI Lab

**公開環境**: [CommitPay](https://commitpay-agi-lab-921302036612.asia-northeast1.run.app)（Cloud Run / asia-northeast1）

目標を宣言し、写真・動画・音声・位置情報の証跡を提出すると、Gemini が達成状況を判定するハッカソン向けアプリです。未達時は猶予期間と異議申し立てを経て、Stripe のペナルティ処理を行います。

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

## GCP 用デプロイスクリプト

```bash
PROJECT_ID=ai-lab-okita2026 ./infra/deploy.sh
```

デプロイ先は GCP の AI Lab（`ai-lab-okita2026`）です。Cloud Run、Cloud SQL、Cloud Storage、Cloud Scheduler、Secret Manager を作成します。デフォルトのサービス名は `commitpay-agi-lab` で、関連リソース名もこの接頭辞を使用します。元の `commitpay` サービスとは別のリソースになります。必要に応じて `SERVICE` を変更できます。

スクリプトは参照元と同じ macOS Apple Silicon 向け Cloud SQL Auth Proxy を使います。GCP の認証・権限・課金設定が別途必要です。公開環境は Vertex AI を利用し、Stripe は未設定のためモック決済です。Cloud Scheduler が5分ごとに期限切れを処理します。
