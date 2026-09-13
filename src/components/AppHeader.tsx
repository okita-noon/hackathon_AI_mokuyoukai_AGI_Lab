import Link from "next/link";
import styles from "./AppHeader.module.css";

/**
 * 画面上部の固定ヘッダ。ネイティブアプリのナビゲーションバーに寄せて、
 * タイトルを中央、戻る導線を左に置く。
 */
export default function AppHeader({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <header className={styles.header}>
      {backHref ? (
        <Link href={backHref} className={styles.back} aria-label="戻る">‹</Link>
      ) : (
        <span className={styles.spacer} />
      )}
      <h1 className={styles.title}>{title}</h1>
      <span className={styles.spacer} />
    </header>
  );
}
