"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useSuggestionLocate() {
  const highlightTimeoutRef = useRef<number | null>(null);
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  function handleLocateEntitySuggestion(suggestionId: string) {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    setHighlightedSuggestionId(suggestionId);
    requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLElement>("[data-suggestion-id][data-highlighted='true']")
        .forEach((element) => element.removeAttribute("data-highlighted"));
      const target = document.querySelector<HTMLElement>(
        `[data-suggestion-id="${CSS.escape(suggestionId)}"]`
      );
      if (!target) {
        toast.info("관련 항목 후보를 현재 목록에서 찾지 못했습니다.");
        return;
      }
      let scrollParent = target.parentElement;
      while (scrollParent) {
        const style = window.getComputedStyle(scrollParent);
        const canScroll = scrollParent.scrollHeight > scrollParent.clientHeight;
        if (canScroll && /(auto|scroll)/.test(style.overflowY)) break;
        scrollParent = scrollParent.parentElement;
      }

      target.setAttribute("data-highlighted", "true");
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const centeredTop =
          scrollParent.scrollTop +
          targetRect.top -
          parentRect.top -
          (parentRect.height - targetRect.height) / 2;
        scrollParent.scrollTo({ top: centeredTop, behavior: "smooth" });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSuggestionId((current) => current === suggestionId ? null : current);
      document
        .querySelectorAll<HTMLElement>("[data-suggestion-id][data-highlighted='true']")
        .forEach((element) => element.removeAttribute("data-highlighted"));
      highlightTimeoutRef.current = null;
    }, 5000);
  }

  return { highlightedSuggestionId, handleLocateEntitySuggestion };
}
