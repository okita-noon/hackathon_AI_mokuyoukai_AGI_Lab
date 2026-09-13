import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/Shell";

const jp = Zen_Maru_Gothic({
  variable: "--font-jp",
  weight: ["400", "700", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AIおかん — 自分以上に自分を知っているAI",
  description:
    "過去の行動パターンを知るAIおかんと約束し、頑張りを報告する目標達成アプリ。自分で決めた約束を、おかんと一緒に守りましょう。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${jp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
