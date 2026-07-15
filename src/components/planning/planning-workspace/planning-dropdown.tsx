"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function PlanningDropdown({
  ariaLabel,
  value,
  onChange,
  options,
  disabled = false,
  compact = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
  compact?: boolean;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function focusOption(offset: number) {
    const buttons = getEnabledOptionButtons(listRef.current);
    if (buttons.length === 0) return;
    const activeIndex = buttons.findIndex(
      (button) => button === document.activeElement
    );
    const nextIndex =
      activeIndex === -1
        ? offset > 0
          ? 0
          : buttons.length - 1
        : (activeIndex + offset + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  }

  function openList() {
    if (disabled) return;
    setOpen(true);
    window.setTimeout(() => {
      const buttons = getEnabledOptionButtons(listRef.current);
      const selectedIndex = buttons.findIndex(
        (button) => button.dataset.value === value
      );
      buttons[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
    }, 0);
  }

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openList();
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(-1);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      style={open ? { zIndex: 70 } : undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
        className={[
          "flex w-full items-center justify-between gap-3 rounded-md border border-sw-border-default bg-sw-bg-surface text-left text-sm font-semibold text-sw-text-primary outline-none transition-colors hover:border-sw-border-hover focus:border-sw-border-focus focus:ring-2 focus:ring-sw-border-focus disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "min-h-9 px-2" : "min-h-10 px-3",
        ].join(" ")}
      >
        <span className="truncate">
          {selectedOption?.label ?? "선택"}
        </span>
        <ChevronDown
          className={[
            "shrink-0 text-sw-text-muted transition-transform",
            open ? "rotate-180" : "",
            compact ? "size-3.5" : "size-4",
          ].join(" ")}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 isolate overflow-auto rounded-md border p-1"
          style={{
            backgroundColor: "var(--sw-bg-overlay)",
            borderColor: "var(--sw-border-default)",
            boxShadow: "0 18px 42px rgba(61, 43, 22, 0.18)",
          }}
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-value={option.value}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={[
                  "flex min-h-9 w-full items-center gap-2 rounded-[6px] px-2.5 text-left text-sm font-semibold outline-none transition-colors focus:bg-sw-accent-bg focus:text-sw-accent disabled:cursor-not-allowed disabled:text-sw-text-ghost",
                  selected
                    ? "bg-sw-accent-bg text-sw-accent"
                    : "text-sw-text-primary hover:bg-sw-bg-hover",
                ].join(" ")}
              >
                <Check
                  className={[
                    "size-4 shrink-0",
                    selected ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getEnabledOptionButtons(container: HTMLDivElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      'button[role="option"]:not(:disabled)'
    )
  );
}
