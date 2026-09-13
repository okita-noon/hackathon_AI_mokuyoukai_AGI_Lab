# AIおかん

**自分以上に自分を知っとるAIが、目標を達成するまで逃がしてくれへん。**

ハッカソン20260913（AI木曜会 × AGI Lab）作品。

## 何を解くか

| | |
|---|---|
| 課題 | 目標を管理できない。記録が続かない |
| なぜ続かないか | 意志の問題ではなく、**誰にも見られていない**から |
| 解決策 | 過去の自分を全部読んだAIが約束を結び、**証拠を出すまで許さない** |

## 体験（4ステップ）

1. **過去を渡す** — Gmail / X / LINE の履歴を投入（いずれも実際にエクスポートできる形式）
2. **気づいたことを聞く** — AIが繰り返している行動を名指しで指摘する
3. **約束を結ぶ** — 目標・期限・証拠・**罰金額を自分で決める**（自己拘束）
4. **見守られる** — 提出した写真・動画をマルチモーダルAIが判定。ごまかしは通らない

## 動かし方

```bash
npm install
npm run dev
```

PostgreSQL を起動し、ルートの `db/schema.sql` を適用してからアプリを起動する。

```bash
docker compose -f ../docker-compose.yml up -d --wait db
cd .. && npm run db:migrate && cd ai-okan
DATABASE_URL=postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab npm run dev
```

APIキーなしでも4ステップすべて動く（**デモモード**＝固定応答へのフェイルセーフ）。
実際のAIで動かす場合は `.env.local` に以下のどちらかを置く。

```bash
GEMINI_API_KEY=...    # 優先。gemini-2.5-flash
# または
OPENAI_API_KEY=...    # gpt-4o-mini
```

Cloud Run では `USE_VERTEX=1`、`GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION` を使い、サービスアカウント経由で Vertex AI に接続する。

画面右上のバッジに、**実AIで生成したのか固定応答なのか**が常に表示される。

## 罰金の支払い（Stripe Checkout）

`.env.local` に Stripe のテスト用シークレットキーを置くと、「期限切れにする」のあとに罰金の支払い欄（支払い画面を開くボタンと QR コード）が出る。

```bash
STRIPE_SECRET_KEY=sk_test_...
# 任意。決済後の戻り先。未設定ならリクエストの Host から組み立てる
APP_BASE_URL=https://example.run.app
```

- 支払い画面は Stripe がホストする Checkout。テストモードではカード番号 `4242 4242 4242 4242`（有効期限は未来の日付、CVC は任意）で払え、実際には請求されない
- テストキー（`sk_test_`）のときは「テストカードで支払う（デモ用）」ボタンも出る。押すとサーバー側で Stripe のテスト用決済手段 `pm_card_visa` を使って決済するので、カード番号を入力せずに決済完了まで見せられる（本番キーでは動かない）
- PC で投影しながらスマホで QR を読んで払うと、PC 側も数秒以内に「支払いを確認しました」に切り替わる（Webhook なしで、画面から Stripe に状態を問い合わせている）
- ローカル起動中にスマホで払うと、決済後の戻り先（`localhost`）はスマホから開けない。支払い自体は PC 側の画面で確認できる
- キー未設定なら従来どおり罰金は `MOCKED` として記録するだけ

Cloud Run では `STRIPE_SECRET_KEY` を Secret Manager 経由で渡す（ルートの `infra/deploy.sh` を `STRIPE_SECRET_KEY` 付きで実行すると登録される）。

## 構成

| パス | 役割 |
|---|---|
| `app/page.tsx` | 4ステップの状態遷移 |
| `app/api/okan/` | 人物プロファイル生成・約束への返答・説教 |
| `app/api/verify/` | 提出された写真・動画がエビデンスとして妥当かの判定 |
| `app/api/penalty/checkout/` | 罰金の支払い画面（Stripe Checkout）の発行と支払い状況の確認 |
| `app/penalty/paid/` | 決済後の戻り先。支払いを確定させる |
| `lib/llm.ts` | Vertex AI / Gemini / OpenAI / デモモードの吸収層 |
| `lib/backend/` | Cloud SQL 接続、約束の検証・期限変換 |
| `data/past-self.json` | 過去2年分のサンプル履歴 36件 |
| `docs/superpowers/specs/` | 設計書 |

約束、判定ログ、罰金のモック記録、画面の復元状態は PostgreSQL に保存する。ハッカソン用の固定デモユーザーを使い、認証は持たない。localStorage はDBが一時的に読めない場合の表示用キャッシュとして使う。提出画像・動画の実データは保存せず、重複判定用の SHA-256 とメタデータだけを残す。

## 動画の扱い

証拠は写真だけでなく動画も提出できる。モデルによって解析の経路が変わる。

| キー | 解析されるもの |
|---|---|
| `GEMINI_API_KEY` | **動画そのもの**（8MBまではインラインで送信） |
| `OPENAI_API_KEY` | 動画から等間隔で抜き出した**連続フレーム3枚**（Chat Completions APIが動画を受け取れないため） |
| キーなし | 固定応答（デモモード） |

8MBを超える動画は、キーの種類にかかわらずフレームで判定する。画面の「解析対象」表示で、実際に何を見たのかが分かる。

## おかんの顔

`public/okan.png` に配置済み。差し替える場合は同じ場所に `okan.png` / `okan.jpg` / `okan.webp` のいずれかを置く。
どれも見つからない場合は「おかん」という文字にフォールバックする。
