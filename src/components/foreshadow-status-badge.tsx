import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ForeshadowStatus } from "@/types";

const STATUS_CONFIG: Record<
  ForeshadowStatus,
  { label: string; className: string }
> = {
  PLANTED: {
    label: "심어짐",
    className: "bg-sw-accent-bg text-sw-accent border-sw-accent-border",
  },
  REVEALED: {
    label: "회수됨",
    className: "bg-sw-info/10 text-sw-info border-sw-info/25",
  },
  ABANDONED: {
    label: "폐기됨",
    className: "bg-sw-bg-hover text-sw-text-ghost border-sw-border-default",
  },
};

export function ForeshadowStatusBadge({ status }: { status: ForeshadowStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PLANTED;
  return (
    <Badge variant="outline" className={cn("text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}
