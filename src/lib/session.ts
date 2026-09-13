import { one } from "./db";

/**
 * MVPの割り切り: 認証は実装しない。デモユーザー1人に固定する。
 * 本番では Identity Platform / Firebase Auth の ID トークンを検証して user_id を引く。
 */
export async function currentUser() {
  const u = await one<any>(
    `INSERT INTO users (email, display_name)
     VALUES ('demo@commitpay.dev', 'デモユーザー')
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
  );
  return u!;
}
