import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/services/entity-extraction/concurrency";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const gates = [deferred(), deferred(), deferred()];
    const task = mapWithConcurrency([0, 1, 2], 3, async (i) => {
      await gates[i].promise;
      return `r${i}`;
    });
    // Finish out of order: 2 → 0 → 1
    gates[2].resolve();
    gates[0].resolve();
    gates[1].resolve();
    expect(await task).toEqual(["r0", "r1", "r2"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("actually runs items concurrently (not sequentially)", async () => {
    const started: number[] = [];
    const gate = deferred();
    const task = mapWithConcurrency([0, 1, 2, 3], 4, async (i) => {
      started.push(i);
      await gate.promise;
      return i;
    });
    // Give workers a tick to start
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual([0, 1, 2, 3]);
    gate.resolve();
    await task;
  });

  it("propagates the first rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (i) => {
        if (i === 2) throw new Error("boom");
        return i;
      })
    ).rejects.toThrow("boom");
  });

  it("handles empty input and limit larger than items", async () => {
    expect(await mapWithConcurrency([], 4, async (i) => i)).toEqual([]);
    expect(await mapWithConcurrency([7], 8, async (i) => i * 2)).toEqual([14]);
  });
});
