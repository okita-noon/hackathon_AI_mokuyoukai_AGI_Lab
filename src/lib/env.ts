export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  useVertex: process.env.USE_VERTEX === "1",
  gcpProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  gcpLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
  judgeModel: process.env.JUDGE_MODEL ?? "gemini-2.5-flash",
  arbiterModel: process.env.ARBITER_MODEL ?? "gemini-2.5-pro",
  designerModel: process.env.DESIGNER_MODEL ?? "gemini-2.5-flash",
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "gcs",
  gcsBucket: process.env.GCS_BUCKET ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "dev-secret",
  gracePeriodHours: Number(process.env.GRACE_PERIOD_HOURS ?? "24"),
};

// 判定を確定させる確信度の閾値。これ未満は UNCERTAIN 扱いに落として人／調停AIに回す
export const CONFIDENCE_THRESHOLD = 0.75;
