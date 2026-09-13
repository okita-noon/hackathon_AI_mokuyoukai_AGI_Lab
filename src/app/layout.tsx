import "./globals.css";
import type { Metadata, Viewport } from "next";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  title: "CommitPay",
  description: "AIが証跡を判定し、未達なら自動でペナルティを執行する目標管理",
};

// モバイルアプリとして見せるため、ズームを抑えノッチ領域まで描画する
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <TabBar />
      </body>
    </html>
  );
}
