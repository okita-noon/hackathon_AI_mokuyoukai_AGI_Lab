"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * モバイルアプリ風の下部タブバー。
 * layout.tsx に置いて全画面で共有し、入口（/）とデバッグ画面では自分で消える。
 * こうしておくと、各ページ側がタブバーの存在を意識しなくて済む。
 */
const TABS = [
  { href: "/app", label: "ホーム", icon: "home" },
  { href: "/handbook", label: "約束手帳", icon: "book" },
  { href: "/mypage", label: "マイページ", icon: "user" },
];

function TabIcon({ name }: { name: string }) {
  if (name === "book") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" /></svg>;
  if (name === "user") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0h14Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10h-6v-6H9v6H3V10Z" /></svg>;
}

export default function TabBar() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/debug")) return null;

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} data-active={pathname.startsWith(t.href)}>
          <span className="tabbar-icon"><TabIcon name={t.icon} /></span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
