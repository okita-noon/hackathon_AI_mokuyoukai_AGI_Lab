import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const jp = Zen_Maru_Gothic({
  variable: "--font-jp",
  weight: ["400", "700", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AIおかん — 自分以上に自分を知っているAI",
  description:
    "過去のデータをすべて読み込み、目標を達成するまで外圧をかけ続けるAI。達成できなければ罰金です。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${jp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
