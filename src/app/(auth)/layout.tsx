export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, rgba(79,140,92,0.08) 0%, transparent 50%), var(--sw-bg-base)",
      }}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
