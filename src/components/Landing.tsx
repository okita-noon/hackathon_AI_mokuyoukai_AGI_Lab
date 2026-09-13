import Link from "next/link";
import styles from "./Landing.module.css";

export default function Landing() {
  return (
    <main className={`${styles.main} screen`}>
      <div className={styles.inner}>
        <h1 className={styles.title}>CommitPay</h1>
        <p className={styles.lead}>目標をAIが判定し、未達なら自動でペナルティを執行する。</p>
        <Link href="/app" className={styles.cta}>
          はじめる
        </Link>
      </div>
    </main>
  );
}
