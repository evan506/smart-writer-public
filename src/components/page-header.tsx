export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-sw-border-default bg-sw-bg-base/80 px-6 py-4">
      <div>
        <h1 className="text-2xl font-bold text-sw-text-primary">{title}</h1>
        {description && (
          <p className="text-sm text-sw-text-secondary">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
