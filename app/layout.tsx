import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const jp = Zen_Maru_Gothic({
  variable: "--font-jp",
  weight: ["400", "700", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AIおかん — 自分以上に自分を知っとるAI",
  description:
    "過去のあんたを全部読んで、目標を達成するまで外圧をかけ続けるAI。達成できひんかったら罰金や。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${jp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
