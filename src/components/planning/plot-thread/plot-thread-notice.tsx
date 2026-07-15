"use client";

export type PlotThreadNotice = { tone: "error" | "success"; text: string } | null;

export function PlotThreadNoticeBanner({ notice }: { notice: PlotThreadNotice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${
        notice.tone === "error"
          ? "border-sw-danger bg-sw-bg-elevated text-sw-danger"
          : "border-sw-accent-border bg-sw-accent-bg text-sw-accent"
      }`}
    >
      {notice.text}
    </p>
  );
}
