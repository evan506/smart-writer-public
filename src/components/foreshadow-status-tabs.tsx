import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ForeshadowStatus } from "@/types";

const TABS: { label: string; value: ForeshadowStatus | "ALL" }[] = [
  { label: "전체", value: "ALL" },
  { label: "심어짐", value: "PLANTED" },
  { label: "회수됨", value: "REVEALED" },
  { label: "폐기됨", value: "ABANDONED" },
];

export function ForeshadowStatusTabs({
  projectId,
  currentStatus,
  counts,
}: {
  projectId: string;
  currentStatus?: string;
  counts?: Partial<Record<ForeshadowStatus | "ALL", number>>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-sw-border-default pb-px">
      {TABS.map((tab) => {
        const isActive =
          tab.value === "ALL"
            ? !currentStatus
            : currentStatus === tab.value;
        const href =
          tab.value === "ALL"
            ? `/projects/${projectId}/foreshadows`
            : `/projects/${projectId}/foreshadows?status=${tab.value}`;

        return (
          <Link
            key={tab.value}
            href={href}
            className={cn(
              "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-b-2 border-sw-accent text-sw-accent"
                : "text-sw-text-muted hover:text-sw-text-primary"
            )}
          >
            <span>{tab.label}</span>
            {counts?.[tab.value] !== undefined && (
              <span className="ml-1 rounded-full bg-sw-bg-hover px-1.5 py-0.5 text-[11px] text-sw-text-muted">
                {counts[tab.value]}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
