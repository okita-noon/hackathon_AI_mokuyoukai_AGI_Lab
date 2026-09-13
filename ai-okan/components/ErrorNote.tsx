export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border-2 border-danger bg-bg p-4 font-bold text-danger"
    >
      {message}
    </p>
  );
}
