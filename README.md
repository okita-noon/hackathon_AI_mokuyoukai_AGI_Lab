# ＡＩおかん — AI木曜会 × AGI Lab

**[公開デモを試す](https://commitpay-agi-lab-921302036612.asia-northeast1.run.app)** · **[開発に込めた思い](WHY_WE_BUILT_AI_OKAN.md)**

## 「あんたのこと、わかってる。せやから、応援したいんや。」

**あなたの過去を理解し、頑張ったら褒め、サボったら叱る。ひとりでは続かなかった目標に、あなただけの「おかん」と挑むウェブアプリ。**

「今度こそ、続けたい」

勉強も、運動も、ずっとやりたかった挑戦も。始めたときは本気だったのに、忙しさに追われ、いつの間にか後回しになってしまう。

そんなとき、あなたの性格も、これまでの頑張りも、つまずきやすいところも理解している相手がいたら。小さな前進を喜んでくれて、諦めそうなときには本気で励ましてくれたら。

ＡＩおかんは、過去の行動パターンを理解する仮想人物と約束を結び、進捗や達成の証拠を報告するウェブアプリです。頑張ったら具体的に褒め、未達成なら振り返りを促し、次の挑戦へと励まします。

自分で決めた罰金額も、約束の一部。「応援してもらえる喜び」と「自分で決めた約束への責任」で、目標達成を後押しします。Stripe未設定では罰金はモック記録です。設定時はStripe Checkoutで支払えます。テストキーでは実請求は発生しません。

**目指すのは、「自分以上に、自分のことをわかってくれている」と感じられるおかんです。**

## 画面で見るＡＩおかん

実際のアプリを、同梱の公開情報・固定デモ応答で撮影しています。判定画面は、目標と無関係なおかんの画像を提出した固定デモ例です。実AIによる評価の実績を示すものではありません。

| おかんに会う | 自分の傾向を知る |
|---|---|
| ![AIおかんのトップ画面](docs/screenshots/01-home.png) | ![公開情報を使ったおかんが気づいたこと](docs/screenshots/02-dossier.png) |

| 約束を決める | 証拠を提出して確認する |
|---|---|
| ![目標・期限・証拠・金額の設定画面](docs/screenshots/03-promise.png) | ![証拠判定の固定デモ応答](docs/screenshots/04-watch.png) |

画像をクリックすると拡大できます。[撮影と動作確認の手順](docs/TESTING.md)もリポジトリに含めています。

## 01｜価値 — ひとりだと続かない人に、報告したくなる相手を

ＡＩおかんが役に立ちたいのは、**やりたいことはあるのに、ひとりでは実行や継続が難しい人**です。

| こんな人に | おかんと取り組むこと | 得られる価値 |
|---|---|---|
| 資格や語学の勉強が続かない人 | 学習目標を決め、取り組んだ内容を報告する | 小さな達成を認めてもらい、次の学習につなげられる |
| 運動を始めても、足が遠のいてしまう人 | 実行できる目標と期限を決める | 先延ばしにしそうなとき、約束を思い出せる |
| 作品づくりや個人開発が途中で止まる人 | 完成までにやることを具体化し、進捗を伝える | ひとりで抱え込まず、次に進むための相談ができる |
| 自分の頑張りを誰かに見てほしい人 | できたことも、できなかったことも報告する | 結果を受け止め、次の行動を考えてくれる相手ができる |

毎回、自分の事情を一から説明するのは大変です。ＡＩおかんは、渡された過去のデータを相談に活かし、「この人は、どこでつまずきやすいのか」「どんな目標を大切にしてきたのか」を踏まえて関わります。

**今日の頑張りを、おかんに報告したい。その気持ちが、明日も取り組む理由になる。** そんな体験を届けます。

## 02｜実現性 — ブラウザで、４つのステップを体験できる

[公開デモ](https://commitpay-agi-lab-921302036612.asia-northeast1.run.app)では、次の流れを体験できます。

1. **自分を知ってもらう。** 同梱の公開情報データセットと、任意の補足をもとに、AIが行動パターンを読み取ります。
2. **おかんが気づいたことを聞く。** 履歴中の具体的な出来事をもとに、つまずきやすいところや繰り返している傾向を言葉にします。
3. **約束を結ぶ。** 目標・期限・達成を示す証拠・罰金額を自分で決め、おかんに伝えます。
4. **取り組んで、報告する。** 写真や動画を提出すると、AIが目標との一致を判定し、褒めたり、確認が必要な点を伝えたりします。

約束や判定ログ、画面の復元状態はPostgreSQLに保存します。AI未設定や呼び出し失敗時は固定応答のデモモードに切り替わり、画面のバッジで実際のAI応答と区別します。

**公開デモで試せる範囲と、完成版のサービス紹介**

| 対象 | 内容 |
|---|---|
| このリポジトリの公開デモ | 公開情報データセットによるおかんが気づいたこと、約束、写真・動画の判定、未達時の叱咤、モック記録またはStripe Checkoutの支払い |
| 別途開発された完成版のサービス紹介 | 自分のSNS・メール・AI会話履歴を渡した個別理解と、赤十字などの団体・友人・母親など、指定先への罰金の支払い |

このREADMEの起動・運用手順は、リポジトリ内の公開デモを対象にしています。HttpOnly Cookieによる匿名セッションで状態を分離します。個人アカウントの認証はなく、個人の履歴ファイルの取り込みや、指定した第三者への実際の送金は公開デモに含まれません。

## 03｜新規性 — 自分を知る「おかん」と、お金の約束を組み合わせる

ＡＩおかんのおもしろさは、**過去の自分への理解、母親のような関わり方、自分で決める罰金**を、ひとつの目標達成体験に組み込んだことです。

過去のデータがあるから、繰り返している先延ばしや挫折の傾向に踏み込める。おかんという相手がいるから、褒められるうれしさも、叱られるときの納得感も生まれる。そこに自分で決めたお金の約束を加えることで、行動に具体的な責任を持たせます。

> **会話イメージ**
>
> **あなた：**「今日も、勉強は来週からにしようかな……」
>
> **おかん：**「前も『来週から』って言うてたな。今回は今日やるって決めたやろ。まず一問、一緒に始めよか。」
>
> **あなた：**「決めてたところまで、できた！」
>
> **おかん：**「ようやった！ 後回しにせんと取り組めたな。今日のあんた、ちゃんと約束守れたやん。」

厳しさにも役割があります。約束を曖昧にせず、できなかった行動を振り返る。そして、次に何をするかまで一緒に考える。**「わかってくれている相手に、ちゃんと応援してもらう」ことを、継続の動機にします。**

## 04｜AIの活かし方 — 過去を読み、約束を受け止め、行動を確かめる

AIが、過去の記録と、これから取り組む目標と、提出された結果をつなげて扱います。

| AIの役割 | 使う情報 | ユーザーに返すもの |
|---|---|---|
| 自分の傾向を理解する | 公開情報データセットと本人からの補足 | 日付や回数などを根拠にした、行動・挫折パターンのおかんが気づいたこと |
| 約束を受け止める | おかんが気づいたことと、本人が決めた目標・期限・証拠・罰金額 | その人の傾向を踏まえた、おかんからの返答 |
| 行動を確かめる | 約束の条件と、提出された写真・動画 | 証拠として成立するかの判定、確認できた内容、その理由 |
| 次の挑戦を支える | 達成判定や未達の結果、利用できる背景情報 | 具体的な称賛や叱咤、次に向けた励まし |

「続かなかった」という結果にも、その人なりの経緯があります。履歴の具体的な出来事を読み取り、約束への返答に活かすことで、自分に向けた言葉として受け止められる体験を目指します。

証拠の確認には、画像や動画を理解するマルチモーダルAIを使います。動画は利用するモデルやファイルサイズに応じて、動画そのもの、または抽出した連続フレームを解析します。画面には実際の解析対象を表示します。

実装はVertex AI・Gemini API・OpenAIに対応しています。詳しいモデルの使い分けと動画処理は、[アプリの技術説明](ai-okan/README.md)を参照してください。

## 05｜展開性 — 続ける負担を減らし、一人ひとりに合う応援へ

今後は、**報告の手間を減らすこと**と、**その人に合う関わり方を深めること**を軸に育てていきたいと考えています。

以下は、今後の展開案です。

- **日々の記録との連携。** 本人が許可した範囲で、学習記録やウェアラブルの活動データなどを取り込み、報告の負担を減らします。
- **応援の仕方の個別化。** やさしく励ましてほしい人、きっぱり言ってほしい人。それぞれの希望や利用中の反応を踏まえ、言葉のかけ方や目標の大きさを調整できるようにします。
- **仲間と取り組む目標への拡張。** 学習グループや創作チームなどで、本人が選んだ進捗を共有し、互いの挑戦を応援できる仕組みへ広げます。
- **継続への効果の検証。** 目標達成率、継続日数、報告の負担感などを確かめ、どの関わり方が役立つかを改善に反映します。

目指すのは、**その人の「やりたい」を理解し、達成するまで関わってくれる存在**です。目標が変わっても、次の挑戦をまた相談したくなる。そんなおかんへ育てていきます。

## 次の目標は、おかんと一緒に。

やりたいことがある。今度こそ、やり遂げたい。

その気持ちを、まずはおかんに話してみてください。

**[公開デモで、おかんに会う](https://commitpay-agi-lab-921302036612.asia-northeast1.run.app)**

このアプリをつくった理由は、[「なぜ、ＡＩおかんをつくったのか」](WHY_WE_BUILT_AI_OKAN.md)につづっています。

**「あんた、ほんまは何がしたいん？ うちに聞かせてみ。」**

---

## 開発者向けガイド

[開発への参加](CONTRIBUTING.md) · [現在の設計](docs/CURRENT_ARCHITECTURE.md) · [テストと撮影](docs/TESTING.md) · [セキュリティ](SECURITY.md)

デプロイ対象は **`ai-okan/`** です。API RouteからVertex AIとCloud SQLへ接続します。ルートの旧CommitPay実装は、DBスキーマ・マイグレーション・スケジューラーの共有バックエンドとして残しています。

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
cp .env.example .env.local
DATABASE_URL=postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いて「過去のデータを渡す」から進みます。

`ai-okan/.env.local` の `GOOGLE_API_KEY` または `GEMINI_API_KEY` を設定するとGeminiを利用します。Vertex AIでは `USE_VERTEX=1` と `GOOGLE_CLOUD_PROJECT` を設定します。AI未設定や呼び出し失敗時は固定応答のデモモードに切り替わります。

約束、判定ログ、期限切れ時のモック罰金、画面の復元状態はPostgreSQLに保存します。提出した画像・動画そのものは保存せず、重複判定用のハッシュとメタデータを残します。

DB はこのプロジェクト専用の Compose ボリュームを使い、`localhost:55432/commitpay_agi_lab` で接続します。元リポジトリの DB とポート・データを分けています。`db:migrate` と `tick` も `.env` を読み込みます。設定変更後は開発サーバーを再起動してください。

## 画面とAPI

| パス | 内容 |
|---|---|
| `/` | スタートページ |
| `/ingest` | 公開情報の確認・補足入力 |
| `/dossier` | おかんが気づいたこと |
| `/promise` | 目標・期限・証拠・罰金額の設定 |
| `/watch` | 写真・動画の提出、判定、モック罰金 |
| `/api/okan` | 状態復元、人物プロファイルの生成、約束・期限切れの記録 |
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

利用者の状態は匿名セッションごとに分離します。ログイン・別端末への引き継ぎはありません。Stripe未設定時の期限切れボタンは、`penalty_transactions` に `MOCKED` として記録します。設定時は支払い待ちとなり、Checkoutへ進めます。開発ではテストキーを使用してください。詳細は [アプリ開発ガイド](ai-okan/README.md#stripe-checkout) を参照してください。

## 構成

- Next.js 16 App Router / React / TypeScript
- PostgreSQL 16
- Vertex AI / Gemini API / OpenAI（未設定時はデモ応答）
- Cloud Run / Cloud SQL

AIおかん固有の設計とデモ手順は [ai-okan/README.md](ai-okan/README.md) と [ai-okan/DEMO.md](ai-okan/DEMO.md) を参照してください。

## CI/CD

[GitHub Actions](https://github.com/okita-noon/hackathon_AI_mokuyoukai_AGI_Lab/actions/workflows/ci-cd.yml) で次を実行します。

- **main 向け PR**: 依存関係のインストール、型検査、PostgreSQL 16 へのスキーマ適用・再適用、`tests/*.test.ts` があればテスト、本番 Docker イメージのビルド。
- **main への push（PR マージを含む）**: 同じ検証に成功した `ai-okan/` のイメージを Artifact Registry に保存し、本番 DB のスキーマ適用 → Cloud Run の新リビジョン作成 → `/api/health` でDB接続確認 → トラフィック切り替え。
- **手動実行**: Actions の `Run workflow` で `main` を選択。ほかのブランチでは検証だけ実行します。

デプロイ先は `ai-lab-okita2026` / `asia-northeast1` / `commitpay-agi-lab`。既存の環境変数・Secret Manager 参照・Cloud SQL 接続・実行サービスアカウントは維持します。イメージはコミット SHA で識別し、Actions の実行サマリーに公開 URL とリビジョンを記録します。

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
