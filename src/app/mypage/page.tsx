import AppHeader from "@/components/AppHeader";
import MyPage from "@/components/MyPage";

export const metadata = {
  title: "マイページ | CommitPay",
};

export default function Page() {
  return (
    <main className="screen">
      <AppHeader title="マイページ" backHref="/app" />
      <MyPage />
    </main>
  );
}
