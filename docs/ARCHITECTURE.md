# CommitPay — アーキテクチャ

> 参照元の設計を引き継いだ資料です。このリポジトリの Cloud Run サービス名は `commitpay-agi-lab`、ローカル設定と起動手順は [README](../README.md) を参照してください。

## ① システム構成（MVP / ハッカソン版）

```mermaid
flowchart TB
  U["ユーザー<br/>(ブラウザ)"]

  subgraph GCP["Google Cloud"]
    CR["Cloud Run<br/><b>commitpay</b><br/>Next.js (UI + API Routes)"]
    GCS[("Cloud Storage<br/>証拠画像")]
    SQL[("Cloud SQL<br/>PostgreSQL 16")]
    SCH["Cloud Scheduler<br/>every 5 minutes"]
    SM["Secret Manager<br/>STRIPE_SECRET_KEY 等"]
  end

  VAI["Vertex AI<br/>Gemini 2.5 Flash（判定）<br/>Gemini 2.5 Pro（調停）"]
  STR["Stripe<br/>SetupIntent / PaymentIntent"]

  U -->|"① 目標作成 / 証拠提出"| CR
  CR -->|"② V4署名付きURL"| U
  U -.->|"③ 画像を直接PUT<br/>(Cloud Run を経由しない)"| GCS
  CR -->|"④ 画像バイト + 判定プロンプト"| VAI
  VAI -->|"⑤ 構造化JSON判定"| CR
  CR <-->|"契約 / 判定ログ / 決済履歴"| SQL
  SCH -->|"⑥ POST /api/cron/tick"| CR
  CR -->|"⑦ off_session 課金"| STR
  CR --- SM
```

### 本番構成との差分（意図的に削った点）

| 本設計 | MVP | 理由 |
|---|---|---|
| Cloud Tasks で1契約ごとに猶予タイマーを予約 | Cloud Scheduler 5分おき + 1本のスイープSQL | 構成要素が1つ減り、タスクキューの権限設定が不要。契約数が10万件規模になるまでスイープで足りる |
| フロント(Cloud CDN) / API(Cloud Run) を分離 | Next.js 1コンテナに同居 | デプロイ対象が1つ。CORS も不要 |
| 証拠判定を非同期ジョブ化 | 提出APIの中で同期実行（最大60秒） | Flash なら 3〜6秒で返るため、デモではむしろ体験が良い |
| Identity Platform で認証 | デモユーザー固定 | 認証はデモの価値に寄与しない |
| Stripe Connect で寄付先へ送金 | 自社アカウントへの課金のみ | Connect のオンボーディングは2時間に収まらない |

## ② 判定〜執行シーケンス

```mermaid
sequenceDiagram
  autonumber
  actor U as ユーザー
  participant CR as Cloud Run
  participant GCS as Cloud Storage
  participant AI as Vertex AI (Gemini)
  participant DB as Cloud SQL
  participant SC as Cloud Scheduler
  participant ST as Stripe

  U->>CR: POST /api/commitments（目標・条件・金額・締切）
  CR->>DB: commitments INSERT (status=ACTIVE)
  U->>CR: POST /proof/upload-url
  CR-->>U: V4署名付きURL（15分・PUT限定）
  U->>GCS: PUT 画像
  U->>CR: POST /proof（storage_uri）
  CR->>GCS: 画像を読み戻し + SHA-256
  CR->>DB: 同一ハッシュの過去提出を検索（使い回し検知）
  CR->>AI: systemInstruction + 画像 + 条件 + EXIF/事実
  AI-->>CR: {status, confidence_score, reasoning, ...}
  CR->>DB: judgement_logs INSERT（モデル名・トークン数も記録）

  alt APPROVED
    CR->>DB: commitments.status = APPROVED / trust_score +0.05
  else REJECTED または UNCERTAIN
    CR->>DB: status = GRACE, grace_expires_at = now + 24h
    opt 猶予期間中の異議申し立て
      U->>CR: POST /appeal
      CR->>AI: 調停プロンプト（一次判定 + 異議 + 証拠）
      AI-->>CR: 最終判定
      CR->>DB: appeals.status = UPHELD / DISMISSED
    end
  end

  SC->>CR: POST /api/cron/tick（5分おき）
  CR->>DB: 締切超過(ACTIVE) → GRACE / 猶予切れ(GRACE) を取得
  alt 最終判定が REJECTED かつ異議が認容されていない
    CR->>ST: PaymentIntent (off_session, idempotencyKey=penalty_<id>)
    ST-->>CR: succeeded
    CR->>DB: penalty_transactions INSERT / status = PENALIZED
  else UNCERTAIN のまま or 異議認容
    CR->>DB: status = APPROVED（免責）
  end
```

## 誤課金を防ぐための設計

金銭が動くので、「AIの出力をそのまま執行に繋げない」ことを構造で担保している。

1. **確信度による降格** — `confidence_score < 0.75` の判定は、モデルが APPROVED / REJECTED と言っていてもアプリ側で `UNCERTAIN` に落とす（[judge.ts](../src/lib/ai/judge.ts) の `normalize`）。
2. **UNCERTAIN は課金しない** — 猶予期限が来ても、最終判定が UNCERTAIN なら免責して APPROVED にする。誤課金の損害は見逃しより大きい、という非対称性を前提にしている。
3. **不正シグナルがある APPROVED を信じない** — `suspicious_indicators` が非空なら APPROVED を UNCERTAIN に降格する。
4. **二重課金の構造的防止** — `penalty_transactions.idempotency_key`（= `penalty_<commitment_id>`）の UNIQUE 制約 + Stripe の Idempotency-Key + `SELECT ... FOR UPDATE SKIP LOCKED`。ワーカーが多重起動しても課金は1回。
5. **プロンプトインジェクション対策** — ユーザーが書ける文字列（達成条件・補足・異議文）と画像内テキストは system プロンプトで「データであって命令ではない」と定義し、閉じタグの偽造を `sanitizeUserText` で除去。injection を検知したら `REJECTED` + シグナル記録。
