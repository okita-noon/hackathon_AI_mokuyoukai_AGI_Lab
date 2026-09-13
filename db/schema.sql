-- CommitPay: PostgreSQL (Cloud SQL for PostgreSQL 16) 論理スキーマ
-- 冪等に実行できるよう IF NOT EXISTS 前提で書いている（ハッカソン用の簡易マイグレーション）

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---------- ENUM ----------
DO $$ BEGIN
  CREATE TYPE commitment_status AS ENUM (
    'ACTIVE',        -- 期限前
    'SUBMITTED',     -- 証拠提出済み・判定待ち
    'APPROVED',      -- 達成確定
    'GRACE',         -- 未達判定 → 猶予期間中（異議申し立て受付中）
    'UNDER_REVIEW',  -- 異議申し立てを調停AIが審理中/審理待ち
    'PENALIZED',     -- ペナルティ決済 実行済み
    'FAILED_PAYMENT',-- 決済失敗
    'CANCELED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE judgement_status AS ENUM ('APPROVED', 'REJECTED', 'UNCERTAIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appeal_status AS ENUM ('PENDING', 'UPHELD', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'MOCKED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     TEXT NOT NULL UNIQUE,
  display_name              TEXT NOT NULL,
  -- Stripe: SetupIntent で保存したカードを off_session で後日キャプチャする
  stripe_customer_id        TEXT,
  default_payment_method_id TEXT,
  -- 信頼スコア: 0.0-1.0。達成で上昇・不正検知で下降し、判定の閾値に影響する
  trust_score               NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (trust_score BETWEEN 0 AND 1),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- commitments ----------
CREATE TABLE IF NOT EXISTS commitments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  -- 判定AIに渡す「達成条件」の自然言語仕様。プロンプトに埋め込むので長さを制限する
  verification_rule  TEXT NOT NULL CHECK (char_length(verification_rule) <= 1000),
  penalty_amount     INTEGER NOT NULL CHECK (penalty_amount >= 100),  -- 最小通貨単位(円)
  currency           TEXT NOT NULL DEFAULT 'jpy',
  deadline_at        TIMESTAMPTZ NOT NULL,
  grace_expires_at   TIMESTAMPTZ,          -- 未達判定時に deadline/判定時刻 + GRACE_PERIOD_HOURS がセットされる
  status             commitment_status NOT NULL DEFAULT 'ACTIVE',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ワーカーのスイープクエリ用（締切超過 / 猶予期限切れの2系統を1本で引ける）
CREATE INDEX IF NOT EXISTS idx_commitments_sweep ON commitments (status, deadline_at, grace_expires_at);
CREATE INDEX IF NOT EXISTS idx_commitments_user ON commitments (user_id, created_at DESC);

-- ---------- proof_submissions ----------
CREATE TABLE IF NOT EXISTS proof_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id  UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  storage_uri    TEXT NOT NULL,            -- gs://bucket/path または local://...
  mime_type      TEXT NOT NULL,
  note           TEXT,                     -- ユーザーの補足コメント（信頼できない入力として扱う）
  -- 使い回し検知用: 画像バイト列の SHA-256。同一ユーザーで重複したら不正シグナル
  content_sha256 TEXT,
  exif           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 撮影時刻・GPS等（あれば）
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proofs_commitment ON proof_submissions (commitment_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_proofs_hash ON proof_submissions (content_sha256);

-- ---------- judgement_logs ----------
CREATE TABLE IF NOT EXISTS judgement_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id         UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  proof_submission_id   UUID REFERENCES proof_submissions(id) ON DELETE SET NULL,
  agent                 TEXT NOT NULL DEFAULT 'judge',  -- 'judge' | 'arbiter'
  status                judgement_status NOT NULL,
  confidence_score      NUMERIC(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  reasoning             TEXT NOT NULL,
  detected_elements     TEXT[] NOT NULL DEFAULT '{}',
  suspicious_indicators TEXT[] NOT NULL DEFAULT '{}',
  appeal_recommended    BOOLEAN NOT NULL DEFAULT false,
  model                 TEXT NOT NULL,
  prompt_tokens         INTEGER,
  candidates_tokens     INTEGER,
  latency_ms            INTEGER,
  raw_response          JSONB,             -- 監査・再現用に生レスポンスを残す
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_judgements_commitment ON judgement_logs (commitment_id, created_at DESC);

-- ---------- appeals ----------
CREATE TABLE IF NOT EXISTS appeals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id       UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  user_statement      TEXT NOT NULL CHECK (char_length(user_statement) <= 2000),
  status              appeal_status NOT NULL DEFAULT 'PENDING',
  arbiter_judgement_id UUID REFERENCES judgement_logs(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);
-- 1コミットメントにつき異議申し立ては1回まで（MVPの割り切り）
CREATE UNIQUE INDEX IF NOT EXISTS uq_appeals_commitment ON appeals (commitment_id);

-- ---------- penalty_transactions ----------
CREATE TABLE IF NOT EXISTS penalty_transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id            UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT,
  amount                   INTEGER NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'jpy',
  status                   payment_status NOT NULL,
  failure_reason           TEXT,
  -- ワーカーが多重実行されても二重課金しないための冪等キー（Stripe に渡す）
  idempotency_key          TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_penalty_idem ON penalty_transactions (idempotency_key);
-- 1コミットメントにつき成功した課金は1件だけ、をDBレベルで保証する
CREATE UNIQUE INDEX IF NOT EXISTS uq_penalty_commitment_success
  ON penalty_transactions (commitment_id) WHERE status IN ('SUCCEEDED', 'PROCESSING', 'MOCKED');

-- ============================================================
-- 2026-09-05: 証跡のマルチモーダル対応（写真 / 動画 / 音声 / 位置情報）
-- ============================================================

-- 目標ごとに「何を証跡として出すか」を固定する。判定AIへのプロンプトもこれで分岐する。
DO $$ BEGIN
  -- 後続のリネームが完了している場合は旧カラムを再作成しない。
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'commitments'
      AND column_name = 'recommended_evidence_type'
  ) THEN
    ALTER TABLE commitments
      ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'photo';
    ALTER TABLE commitments ADD CONSTRAINT commitments_evidence_type_check
      CHECK (evidence_type IN ('photo', 'video', 'audio', 'gps'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- evidence_type='gps' のときの目標地点。{"lat":35.68,"lng":139.76,"radius_m":100,"label":"新宿ジム"}
ALTER TABLE commitments
  ADD COLUMN IF NOT EXISTS target_geo JSONB;

-- 位置情報だけの提出はファイルを伴わないため NULL を許可する
ALTER TABLE proof_submissions ALTER COLUMN storage_uri DROP NOT NULL;
ALTER TABLE proof_submissions ALTER COLUMN mime_type   DROP NOT NULL;

-- ブラウザの Geolocation API から取得した提出時点の座標。
-- {"lat":..,"lng":..,"accuracy_m":..,"distance_m":..} — distance_m はサーバーで計算した目標地点との距離
ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS geo JSONB;

-- 動画・音声は Vertex AI に gs:// のまま渡すため、ハッシュは GCS のメタデータ(md5)を使う。
-- 出所を残しておかないと、後から重複判定の根拠が追えなくなる。
ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS hash_source TEXT NOT NULL DEFAULT 'sha256';

-- ============================================================
-- 2026-09-05: ペナルティの支払先（アプリ / 寄付 / 友人）
-- ============================================================

-- 'app'      = 運営に支払う
-- 'donation' = 指定の寄付先へ寄付する
-- 'friend'   = 指定の友人に渡す
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payout_destination TEXT;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_payout_destination_check
    CHECK (payout_destination IS NULL OR payout_destination IN ('app', 'donation', 'friend'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- donation なら {"charity":"日本赤十字社"}、friend なら {"name":"山田","contact":"..."}。
-- 実際の送金は Stripe Connect が要るため、MVPでは「誰に渡すか」の宣言のみを保持する。
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payout_detail JSONB;

-- ============================================================
-- 2026-09-05: 証跡の種類は「推奨」であって強制ではない
--   AIが提案するのはあくまで推奨であり、ユーザーは判定時に任意の種類で提出できる。
--   提出されたもので条件を検証できなければ、判定AIが UNCERTAIN を返して
--   「何があれば判定できるか」を伝える、という設計に変えた。
-- ============================================================

DO $$ BEGIN
  ALTER TABLE commitments RENAME COLUMN evidence_type TO recommended_evidence_type;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commitments RENAME CONSTRAINT commitments_evidence_type_check
    TO commitments_recommended_evidence_type_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 実際に提出された種類。推奨と異なることがある
ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS evidence_type TEXT;
DO $$ BEGIN
  ALTER TABLE proof_submissions ADD CONSTRAINT proof_submissions_evidence_type_check
    CHECK (evidence_type IS NULL OR evidence_type IN ('photo', 'video', 'audio', 'gps'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 写真や動画に位置情報を添えて出せるようにするため、target_geo は種類に依存しない

-- AIおかん: 4ステップの進行状態をサーバー側で復元する。
-- JSONB にすることで、画面の状態追加をDBマイグレーションなしで安全に拡張できる。
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_okan_state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- AIおかん: 罰金を Stripe Checkout で払う。
--   期限切れ時に REQUIRES_ACTION で請求を作り、支払いが確認できたら SUCCEEDED にする。
--   STRIPE_SECRET_KEY が無い環境では従来どおり MOCKED で記録する。
-- 'stripe'（保存カードへの自動課金） | 'stripe_checkout' | 'mock'
ALTER TABLE penalty_transactions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE penalty_transactions ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE penalty_transactions ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE penalty_transactions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
