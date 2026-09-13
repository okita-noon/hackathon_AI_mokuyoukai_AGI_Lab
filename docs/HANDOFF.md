# 分担ガイド（Claude ↔ GPT）

> 参照元の開発時の分担・API 契約を保存した資料です。このリポジトリでの担当者を指定するものではありません。現在の起動手順は [README](../README.md) を参照してください。

2人（2エージェント）が同時に触ってもコンフリクトしないよう、**所有ファイルを分割**している。
境界は「API契約」で、これを跨ぐ変更だけ相談すればよい。

## 所有権テーブル

| トラック | 担当 | 触ってよいファイル | 触らないファイル |
|---|---|---|---|
| **A: バックエンド / インフラ / AI** | Claude | `db/**`, `src/lib/**`, `src/app/api/**`, `scripts/**`, `infra/**`, `Dockerfile`, `docker-compose.yml` | `src/app/ui.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/components/**` |
| **B: フロントエンド / UX** | GPT | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/**`, `src/app/debug/**` | `src/lib/**`, `src/app/api/**`, `db/**` |

`package.json` は両者が触る可能性があるので、依存追加は**追加のみ**（既存行を並べ替えない）。

### 画面構成（2026-09-05 更新）

| パス | 中身 | ファイル |
|---|---|---|
| `/` | スタートページ。タイトルと「はじめる」だけ。押すと `/app` へ | `src/app/page.tsx` / `src/components/Landing.tsx` |
| `/app` | オンボーディング付きの本番画面。初回（コミットメント0件）は必ずウィザードから始まる | `src/app/app/page.tsx` / `src/components/Home.tsx` / `Onboarding.tsx` / `CommitmentCard.tsx` |
| `/mypage` | マイページ | `src/app/mypage/**` |
| `/debug` | 素のデバッグ画面。ワーカー手動実行・生の判定JSON | `src/app/debug/page.tsx` / `src/app/debug/ui.tsx` |

`/app` と `/mypage` の上部には共通ヘッダ `src/components/AppHeader.tsx`（左: `/` へ戻る「CommitPay」、右: `/mypage` へのリンク）を置く。

**旧 `src/app/ui.tsx` は `src/app/debug/ui.tsx` に移動しました。** イシュー #1〜#6 の対象は原則 `/app`（`src/components/**`）側です。

新しいスタイルは `globals.css` に足さず、**CSS Modules（`Landing.module.css` / `AppHeader.module.css` のような `*.module.css`）** で書く。CSS変数（`--bg` `--panel` `--line` `--fg` `--muted` `--ok` `--warn` `--bad` `--accent`）はそのまま使える。
`/debug` はデモ中に状態を作り込むための道具なので、**見た目を整える必要はありません**（むしろ生の値が見えることに価値があります）。

### Git 運用
```bash
git checkout -b feat/frontend-<内容>   # Track B
git checkout -b feat/backend-<内容>    # Track A
```
`main` への直接 push はしない。所有ファイルが分かれているので、マージは基本 auto-merge される。

---

## API契約（Track A が保証する。変更時は必ずこのファイルを更新する）

ベースURL: 同一オリジン。すべて JSON。エラーは `{ "error": string }` + 4xx/5xx。

### `GET /api/commitments`
```jsonc
{
  "user": { "id": "uuid", "email": "...", "display_name": "...", "trust_score": "0.50",
            "stripe_customer_id": null, "default_payment_method_id": null },
  "commitments": [{
    "id": "uuid", "title": "...", "verification_rule": "...",
    "penalty_amount": 1000, "currency": "jpy",
    "deadline_at": "2026-09-05T04:28:07.000Z",
    "grace_expires_at": "2026-09-06T04:28:07.000Z",  // null あり
    "status": "ACTIVE|SUBMITTED|APPROVED|GRACE|UNDER_REVIEW|PENALIZED|FAILED_PAYMENT|CANCELED",
    "appeal_status": "PENDING|UPHELD|DISMISSED",     // null あり
    "last_judgement": {                               // null あり
      "status": "APPROVED|REJECTED|UNCERTAIN",
      "confidence_score": "0.82",                     // NUMERIC は文字列で来る。Number() すること
      "reasoning": "...",
      "suspicious_indicators": ["reused_image"],
      "appeal_recommended": true,
      "agent": "judge|arbiter|system"
    }
  }]
}
```

### `POST /api/goals/design`  ← 目標設計エージェント
曖昧な目標を、判定AIが使える定量的な達成条件に翻訳する。状態はサーバーに持たないので、**回答履歴を毎回まるごと送る**。

req: `{ goal: string, answers?: [{ question: string, answer: string }] }`

res（追加ヒアリングが必要な場合）:
```jsonc
{ "phase": "QUESTION",
  "questions": [{ "id": "q1", "text": "何が写っていれば達成ですか？", "why": "判定できる条件にするため",
                  "suggestions": ["ランニングアプリの記録画面", "シューズと屋外の風景"] }] }
```
res（条件が確定した場合）:
```jsonc
{ "phase": "PROPOSAL",
  "proposal": { "title": "毎朝5km走る", "verification_rule": "...",
                "checklist": ["距離が5.0km以上と表示されている", "..."],
                "evidence_type": "photo|screenshot|video",
                "suggested_penalty_amount": 1000, "rationale": "..." } }
```
`answers` が3件以上あると必ず PROPOSAL が返る（聞きすぎない設計）。所要 3〜8秒。

### `POST /api/commitments`
req: `{ title, verification_rule, penalty_amount /* >=100 */, deadline_at /* ISO8601 */ }`
res 201: commitment 1件（上と同じ形、`last_judgement` なし）

### `POST /api/commitments/{id}/proof/upload-url`
req: `{ mimeType: "image/jpeg" }` → res: `{ objectPath, uploadUrl, storageUri }`
`uploadUrl` に `PUT`（`content-type` ヘッダ必須）でファイル本体を送る。

### `POST /api/commitments/{id}/proof`
req: `{ storage_uri, mime_type, note? }`
res: `{ judgement: {...}, duplicate_hash_match: boolean, exif: {...} }`
**同期でGeminiを呼ぶため 3〜10秒かかる。ローディングUIは必須。**

### `POST /api/commitments/{id}/appeal`
req: `{ statement: string /* 5文字以上 */ }` → res: `{ appeal_status: "UPHELD"|"DISMISSED", judgement }`
`status === "GRACE"` のときだけ呼べる（それ以外は 409）。

### `POST /api/stripe/setup-intent`
res: `{ clientSecret }` または `{ mock: true, message }`（STRIPE_SECRET_KEY 未設定時）

### `GET|POST /api/cron/tick?secret=<CRON_SECRET>`
res: `{ ok: true, expired: [], charged: [], waived: [], failed: [] }`

---

## タスク管理はGitHub Issues

作業は **Issue 単位**で取る。着手時に自分をアサインし、`feat/frontend-<内容>` / `feat/backend-<内容>` ブランチを切って PR に `Closes #<番号>` を書く。

| # | タイトル | トラック |
|---|---|---|
| [#1](https://github.com/okita-noon/google-mini-hackathon/issues/1) | 一覧と詳細に画面を分割する | B |
| [#2](https://github.com/okita-noon/google-mini-hackathon/issues/2) | AI判定結果を可視化する（確信度ゲージ・不正シグナル・タイムライン） | B |
| [#3](https://github.com/okita-noon/google-mini-hackathon/issues/3) | 猶予期限のリアルタイムカウントダウン | B |
| [#4](https://github.com/okita-noon/google-mini-hackathon/issues/4) | 音声入力のエラーハンドリングと可視化 | B |
| [#5](https://github.com/okita-noon/google-mini-hackathon/issues/5) | Stripe Elements でカード登録UI | B |
| [#6](https://github.com/okita-noon/google-mini-hackathon/issues/6) | モバイル対応（カメラ直撮り・375px幅） | B |
| [#7](https://github.com/okita-noon/google-mini-hackathon/issues/7) | Cloud Run 上で Vertex AI 判定の疎通確認 | A |
| [#8](https://github.com/okita-noon/google-mini-hackathon/issues/8) | Stripe Webhook で支払い方法IDを保存 | A |
| [#9](https://github.com/okita-noon/google-mini-hackathon/issues/9) | 判定プロンプトの評価ケース（インジェクション耐性） | A |
| [#10](https://github.com/okita-noon/google-mini-hackathon/issues/10) | 最終判定の特定を created_at 依存から明示参照に | A |

デモ映えを優先するなら **#3 → #2 → #6** の順。#5 は Stripe の実カード連携が要るので後回しでよい。

### GPT に貼るプロンプト（そのままコピー可）

> Next.js 15 (App Router) + TypeScript のWebアプリ「CommitPay」のフロントエンドを担当してください。
> リポジトリ: `okita-noon/google-mini-hackathon`
>
> 1. `gh issue list --label "agent:gpt" --state open` で未着手のイシューを確認し、番号の小さい順に取り組んでください。
> 2. 各イシューの本文にある「作業ルール」を厳守してください。特に、編集してよいのは
>    `src/app/page.tsx` / `src/app/ui.tsx` / `src/app/layout.tsx` / `src/app/globals.css` / `src/components/**` のみです。
>    `src/lib/**` / `src/app/api/**` / `db/**` / `infra/**` は**絶対に編集しないでください**。
> 3. APIのレスポンス形は `docs/HANDOFF.md` の「API契約」セクションが唯一の真実です。
>    形を変えたくなった場合は実装せず、そのイシューにコメントで変更提案を書いてください。
> 4. イシューごとにブランチ `feat/frontend-<内容>` を切り、`npx tsc --noEmit` を通してから PR を出してください。
>    PR 本文に `Closes #<番号>` を入れてください。
