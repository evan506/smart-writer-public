"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteForeshadow } from "@/app/(dashboard)/projects/[id]/foreshadows/actions";
import { toast } from "sonner";

export function DeleteForeshadowButton({
  foreshadowId,
  projectId,
}: {
  foreshadowId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("이 복선을 삭제하시겠습니까?")) return;
    setPending(true);
    const result = await deleteForeshadow(foreshadowId, projectId);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("복선이 삭제되었습니다");
      router.push(`/projects/${projectId}/foreshadows`);
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={pending}
      className="bg-sw-danger text-sw-bg-base hover:bg-sw-danger/90"
    >
      <Trash2 className="mr-2 size-4" />
      삭제
    </Button>
  );
}
