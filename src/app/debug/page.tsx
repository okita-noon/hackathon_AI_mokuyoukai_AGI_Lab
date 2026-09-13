import Dashboard from "./ui";

/**
 * デバッグ用の素の画面。オンボーディングを挟まず、全ステータス・生の判定結果・
 * ワーカーの手動実行までここで完結する。デモ中に状態を作り込むのに使う。
 */
export default function DebugPage() {
  return (
    <main>
      <h1>CommitPay <span className="muted" style={{ fontSize: 13 }}>/ debug</span></h1>
      <p className="muted">
        オンボーディングを経由しない素の画面。ワーカーの手動実行と生の判定結果が見られる。
        通常の画面は <a href="/">こちら</a>。
      </p>
      <Dashboard />
    </main>
  );
}
