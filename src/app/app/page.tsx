import AppHeader from "@/components/AppHeader";
import Home from "@/components/Home";

export default function Page() {
  return (
    <main className="screen">
      <AppHeader title="ホーム" />
      <Home />
    </main>
  );
}
