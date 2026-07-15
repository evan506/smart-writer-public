import { describe, expect, it } from "vitest";
import {
  PLOT_THREAD_ROW_KINDS,
  PLOT_THREAD_SIGNAL_LABELS,
  isPlotThreadRowKind,
} from "@/lib/planning/plot-thread-constants";

describe("plot-thread constants", () => {
  it("restricts V3.3 row kinds to the five narrative card kinds", () => {
    expect([...PLOT_THREAD_ROW_KINDS]).toEqual([
      "EPISODE",
      "CHAPTER",
      "SCENE",
      "EVENT",
      "PROMISE",
    ]);
  });

  it("rejects ROOT, CHARACTER_PLAN, and PLACE_PLAN as row kinds", () => {
    expect(isPlotThreadRowKind("EPISODE")).toBe(true);
    expect(isPlotThreadRowKind("PROMISE")).toBe(true);
    expect(isPlotThreadRowKind("ROOT")).toBe(false);
    expect(isPlotThreadRowKind("CHARACTER_PLAN")).toBe(false);
    expect(isPlotThreadRowKind("PLACE_PLAN")).toBe(false);
  });

  it("never labels a signal with forbidden adjudication words", () => {
    const labels = Object.values(PLOT_THREAD_SIGNAL_LABELS).join(" ");
    expect(labels).not.toMatch(/일치|실패|자동 확인|AI 판단/);
  });
});
