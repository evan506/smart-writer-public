import type { ReactNode } from "react";

interface DetailSectionProps {
  title?: string;
  titleSuffix?: string;
  children: ReactNode;
}

export function DetailSection({ title, titleSuffix, children }: DetailSectionProps) {
  return (
    <div
      className="px-5 py-[14px]"
      style={{
        borderBottom: "1px solid var(--sw-border-subtle)",
      }}
    >
      {title && (
        <div
          className="text-[10.5px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: "var(--sw-text-dim)" }}
        >
          {title}{" "}
          {titleSuffix && (
            <span className="font-normal opacity-50">{titleSuffix}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
