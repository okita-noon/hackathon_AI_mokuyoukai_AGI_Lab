# 検証と画面キャプチャ

## 単体・回帰テスト

```bash
npm ci --prefix ai-okan
npm run check --prefix ai-okan
```

検証対象は、約束の入力・日本時間の期限、AI出力の構造と上限、匿名セッション、本文の上限、サーバーとキャッシュの優先順位、アップロード前の制限です。APIキーを使わず実行します。

## ブラウザ・API結合テスト

**本番DBを使わないでください。** READMEのローカルDB、または使い捨てのPostgreSQL 16に `db/schema.sql` を適用します。テストは専用の匿名ユーザーと約束を作成します。

本番ビルドを作成します。

```bash
cd ai-okan
npm ci
npx playwright install chromium
npm run build
```

別ターミナルで、`ai-okan/` から静的ファイルを配置して起動します。AI設定はすべて無効にし、固定応答を使います。

```bash
cp -R public .next/standalone/public
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
DATABASE_URL=postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab \
  USE_VERTEX=0 GOOGLE_API_KEY= GEMINI_API_KEY= OPENAI_API_KEY= STRIPE_SECRET_KEY= \
  PORT=3107 HOSTNAME=localhost node .next/standalone/server.js
```

起動後、`ai-okan/` で実行します。

```bash
npm run test:e2e
```

- デスクトップとモバイル幅で、おかんが気づいたこと→約束→証拠提出→モック罰金→リセットを実APIで確認。
- 別セッションから他人の約束を読めず、証拠提出やリセットもできないことを確認。
- 元データの取得失敗からの再試行、404からの復帰を確認。
- 保存した目標の内容をURLへ含めず、再読み込みで復元できることを確認。

モバイルテストはChromiumの端末エミュレーションです。実機iPhoneやSafariでの検証を意味しません。

CIではPostgreSQL 16と非rootの本番Dockerイメージを使います。失敗時のスクリーンショットとtraceはActionsの `browser-test-failures` に7日間保存します。実際のユーザーデータを使った実行の成果物は公開しないでください。

## README画像の再生成

上記のテスト環境で、`ai-okan/` から実行します。

```bash
npm run screenshots
```

`docs/screenshots/` にトップ・おかんが気づいたこと・約束・証拠判定の4枚を保存します。実際のページを撮影し、スクリーンショット自体に装飾や文言の合成は行いません。元データは同梱の公開情報、AI応答と判定は固定デモ応答です。撮影後は画像を目視し、文字切れや表示内容を確認してからコミットしてください。
