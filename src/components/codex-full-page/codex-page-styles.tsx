export function CodexPageStyles() {
  return (
    <style jsx global>{`
      .codex-btn {
        padding: 5px 13px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 160ms ease;
        font-family: inherit;
      }
      .codex-btn-ghost {
        background: transparent;
        border: 1px solid var(--sw-border-default);
        color: var(--sw-text-muted);
      }
      .codex-btn-ghost:hover {
        background: var(--sw-bg-hover);
        color: var(--sw-text-primary);
      }
      .codex-btn-primary {
        background: var(--sw-bg-active);
        border: 1px solid var(--sw-border-focus);
        color: var(--sw-accent);
      }
      .codex-btn-primary:hover {
        background: rgba(79, 140, 92, 0.14);
      }
      .codex-chip {
        padding: 4px 10px;
        border-radius: 16px;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        transition: all 160ms ease;
        border: 1px solid var(--sw-border-default);
        background: transparent;
        color: var(--sw-text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: inherit;
      }
      .codex-chip:hover { background: var(--sw-bg-hover); }
      .codex-chip-review {
        background: rgba(182, 134, 42, 0.1);
        border-color: rgba(182, 134, 42, 0.22);
        color: var(--sw-warning);
        animation: codex-pulse 2.5s ease-in-out infinite;
      }
      .codex-chip-review:hover { background: rgba(182, 134, 42, 0.16); }
      .codex-chip-review-active {
        background: rgba(182, 134, 42, 0.18);
        border-color: rgba(182, 134, 42, 0.34);
        color: var(--sw-warning);
      }
      @keyframes codex-pulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(182, 134, 42, 0); }
        50% { box-shadow: 0 0 0 3px rgba(182, 134, 42, 0.06); }
      }
      .codex-pulse-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--sw-warning);
        animation: codex-dot-pulse 1.5s ease-in-out infinite;
      }
      @keyframes codex-dot-pulse {
        0%,100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      @keyframes codex-fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}
