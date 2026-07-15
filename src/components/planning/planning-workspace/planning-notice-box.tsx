import type { PlanningNotice } from "./types";

export function PlanningNoticeBox({ notice }: { notice: PlanningNotice }) {
  const toneClass =
    notice.tone === "error"
      ? "border-sw-danger text-sw-danger"
      : notice.tone === "success"
        ? "border-sw-accent-border bg-sw-accent-bg text-sw-accent"
        : "border-sw-border-default bg-sw-bg-elevated text-sw-text-muted";

  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={[
        "mt-3 rounded-md border px-3 py-2 text-xs font-semibold leading-5",
        toneClass,
      ].join(" ")}
    >
      {notice.text}
    </p>
  );
}
