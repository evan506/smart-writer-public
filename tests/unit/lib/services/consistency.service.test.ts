import { describe, expect, it } from "vitest";
import { ConsistencyService } from "@/lib/services/consistency.service";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

describe("ConsistencyService.detectConflicts", () => {
  it("returns the RPC result array on success", async () => {
    const conflictRows = [
      { chapter_id: "ch-1", conflict_type: "설정 충돌", description: "..." },
    ];
    const { client, calls } = createSupabaseMock({
      detect_conflicts: { data: conflictRows, error: null },
    });

    const service = new ConsistencyService(client as never);
    const result = await service.detectConflicts("ch-1");

    expect(result).toEqual(conflictRows);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "rpc",
      payload: ["detect_conflicts", { p_chapter_id: "ch-1" }],
    });
  });

  it("returns an empty array when data is null", async () => {
    const { client } = createSupabaseMock({
      detect_conflicts: { data: null, error: null },
    });

    const service = new ConsistencyService(client as never);
    const result = await service.detectConflicts("ch-2");

    expect(result).toEqual([]);
  });

  it("throws the RPC error", async () => {
    const rpcError = { message: "boom", code: "500" };
    const { client } = createSupabaseMock({
      detect_conflicts: { data: null, error: rpcError },
    });

    const service = new ConsistencyService(client as never);

    await expect(service.detectConflicts("ch-3")).rejects.toEqual(rpcError);
  });

  it("calls the RPC with the exact name and args for each chapter", async () => {
    const { client, calls } = createSupabaseMock({
      detect_conflicts: { data: [], error: null },
    });

    const service = new ConsistencyService(client as never);
    await service.detectConflicts("chapter-xyz");

    expect(calls[0].payload).toEqual([
      "detect_conflicts",
      { p_chapter_id: "chapter-xyz" },
    ]);
  });
});
