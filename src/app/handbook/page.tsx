import AppHeader from "@/components/AppHeader";
import PromiseHandbook from "@/components/PromiseHandbook";

export const metadata = {
  title: "オカン約束母子手帳 | CommitPay",
};

export default function Page() {
  return (
    <main className="screen">
      <AppHeader title="オカン約束母子手帳" />
      <PromiseHandbook />
    </main>
  );
}
