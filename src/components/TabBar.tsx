"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * モバイルアプリ風の下部タブバー。
 * layout.tsx に置いて全画面で共有し、入口（/）とデバッグ画面では自分で消える。
 * こうしておくと、各ページ側がタブバーの存在を意識しなくて済む。
 */
const TABS = [
  { href: "/app", label: "ホーム", icon: "◎" },
  { href: "/mypage", label: "マイページ", icon: "☰" },
];

export default function TabBar() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/debug")) return null;

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} data-active={pathname.startsWith(t.href)}>
          <span className="tabbar-icon">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
