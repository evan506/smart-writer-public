"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportPreviewCopyButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copyMarkdown}
      disabled={!markdown}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "복사됨" : "Markdown 복사"}
    </Button>
  );
}
