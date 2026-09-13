import Link from "next/link";

export default function NotFound() {
  return (
    <section className="space-y-5 py-12">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p>URLを確認するか、スタートページから進めてください。</p>
      <Link href="/" className="inline-block rounded-xl bg-accent px-6 py-3 font-bold text-white">スタートページへ</Link>
    </section>
  );
}
