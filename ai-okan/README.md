# AIおかん — アプリ開発ガイド

サービスの紹介・画面キャプチャ・評価軸は [ルートREADME](../README.md)、開発に込めた思いは [WHY_WE_BUILT_AI_OKAN.md](../WHY_WE_BUILT_AI_OKAN.md) を参照してください。

## ローカル起動

ルートでDBを起動しスキーマを適用した後、このディレクトリで実行します。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local` の `DATABASE_URL` をローカルDBに設定します。AIキーなしでも固定応答のデモとして進められます。Geminiは `GOOGLE_API_KEY` または `GEMINI_API_KEY`、OpenAIは `OPENAI_API_KEY`、Vertex AIは `USE_VERTEX=1` と `GOOGLE_CLOUD_PROJECT`、実行環境の認証を使います。

## 実装の範囲

元データは `/api/sources` が返す `data/usutaku.json` の公開情報です。入力できるのは任意の補足で、個人のメールやSNSの実ファイル取り込みはありません。日付不明・未確認の情報は元データの印を保持しています。

人物プロファイル、約束、証拠判定、未達時の返答はAIで生成し、構造を検証します。不正な返答や障害時は `engine: demo` と固定応答を返します。固定判定は画像の意味を解析していないため、実際の達成判定ではありません。

約束・判定ログ・復元用状態はPostgreSQLへ保存します。HttpOnly Cookieで匿名セッションを分けます。Cookieを消すと状態を引き継げません。DBの障害時のみ端末キャッシュを使います。提出画像・動画はAIへ送信しますが、アプリDBにはハッシュとメタデータだけを保存します。

Stripeキー未設定では罰金は `MOCKED` の記録だけです。キー設定時の支払い機能は、下記のStripe Checkoutを参照してください。

## 画面とAPI

| パス | 役割 |
|---|---|
| `/` | トップ |
| `/ingest` | 元データの確認と補足 |
| `/dossier` | おかんが気づいたこと |
| `/promise` | 目標・期限・証拠・金額の設定 |
| `/watch` | 証拠提出・判定・デモの期限切れ |
| `/api/sources` | 公開情報データセット |
| `/api/okan` | 状態の取得・生成・約束作成・リセット |
| `/api/verify` | 所有者を確認した証拠判定と記録 |
| `/api/health` | DB接続と設定されたAIエンジン |

`/api/health` は実際のAI呼び出しの成功を保証するものではありません。

## 動画と画像

ブラウザでは写真8MB、動画32MBまでを受け付けます。対応形式はJPEG・PNG・WebP・GIF・MP4・WebM・MOVです。Gemini/Vertexでは8MB以下の動画を直接送り、OpenAIまたは大きな動画では抽出した連続3フレームを送ります。API側でも本文・メディアの上限を検証します。画面の「解析対象」で送った形式を確認できます。

## 検証

```bash
npm run check
npm run build
npm run test:e2e  # 別途テストDBとアプリを起動
npm run screenshots
```

起動方法、CI、ブラウザの確認範囲は [TESTING.md](../docs/TESTING.md)。設計上の境界は [CURRENT_ARCHITECTURE.md](../docs/CURRENT_ARCHITECTURE.md)、未実装の運用対策は [SECURITY.md](../SECURITY.md) に記載しています。

## Stripe Checkout

`STRIPE_SECRET_KEY` を設定すると、期限切れ時に支払い待ちの請求を作り、Stripeの支払い画面とQRコードを表示します。`sk_test_` のテストキーでは実請求は発生しません。本番キーでは実際の決済につながるため、開発・スクリーンショット撮影・CIでは使いません。

- `APP_BASE_URL` は支払い後に戻るアプリのURLです。
- `/api/penalty/checkout` は所有者の請求に対してCheckoutを作成・確認します。
- `/api/penalty/test-pay` はテストキー専用の支払い操作です。本番キーでは利用できません。
- `/penalty/paid` は支払い後の戻り先です。QRを読んだ別端末からも支払いを確認できます。
- 画面はStripeの状態をポーリングします。Webhookによる無人確定や指定第三者への送金は含みません。

元からあるCheckoutの手動テストをする場合のみ、テスト環境でカード番号 `4242 4242 4242 4242` を使用します。この変更の自動テストではStripe APIを呼びません。
