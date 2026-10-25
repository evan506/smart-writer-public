import { describe, expect, it } from "vitest";
import {
  requireCodexEntityTarget,
  requireCodexEntityTargets,
  requireCodexLinkTarget,
} from "@/lib/services/codex/target-guard.service";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

describe("Codex target guards", () => {
  it("returns the entity name only for the requested project", async () => {
    const { client } = createSupabaseMock({
      entities: { data: { project_id: "project-a", name: "리엔" } },
    });

    await expect(
      requireCodexEntityTarget(client as never, "entity-a", "project-a"),
    ).resolves.toEqual({ error: null, name: "리엔" });
  });

  it("rejects a missing or cross-project entity", async () => {
    const { client } = createSupabaseMock({
      entities: { data: { project_id: "project-b", name: "리엔" } },
    });

    await expect(
      requireCodexEntityTarget(client as never, "entity-a", "project-a"),
    ).resolves.toEqual({ error: "작품 기억 항목을 찾을 수 없습니다" });
  });

  it("requires every distinct endpoint to belong to the project", async () => {
    const { client } = createSupabaseMock({
      entities: {
        data: [
          { id: "entity-a", project_id: "project-a" },
          { id: "entity-b", project_id: "project-b" },
        ],
      },
    });

    await expect(
      requireCodexEntityTargets(
        client as never,
        ["entity-a", "entity-b"],
        "project-a",
      ),
    ).resolves.toEqual({
      error: "권한이 없거나 존재하지 않는 작품 기억 항목입니다",
    });
  });

  it("accepts a link only when both endpoints belong to the project", async () => {
    const { client, calls } = createSupabaseMock({
      entity_links: { data: { from_id: "entity-a", to_id: "entity-b" } },
      entities: {
        data: [
          { id: "entity-a", project_id: "project-a" },
          { id: "entity-b", project_id: "project-a" },
        ],
      },
    });

    await expect(
      requireCodexLinkTarget(client as never, "link-a", "project-a"),
    ).resolves.toEqual({ error: null });

    expect(calls[0]?.filters).toContainEqual({ method: "eq", args: ["id", "link-a"] });
    expect(calls[1]?.filters).toContainEqual({
      method: "in",
      args: ["id", ["entity-a", "entity-b"]],
    });
  });

  it("rejects a link whose destination belongs to another project", async () => {
    const { client } = createSupabaseMock({
      entity_links: { data: { from_id: "entity-a", to_id: "entity-b" } },
      entities: {
        data: [
          { id: "entity-a", project_id: "project-a" },
          { id: "entity-b", project_id: "project-b" },
        ],
      },
    });

    await expect(
      requireCodexLinkTarget(client as never, "link-a", "project-a"),
    ).resolves.toEqual({ error: "권한이 없습니다" });
  });

  it("preserves database errors instead of reporting a missing target", async () => {
    const { client } = createSupabaseMock({
      entities: { data: null, error: { message: "database unavailable" } },
    });

    await expect(
      requireCodexEntityTarget(client as never, "entity-a", "project-a"),
    ).resolves.toEqual({ error: "database unavailable" });
  });

  it("preserves endpoint query errors when checking a link", async () => {
    const { client } = createSupabaseMock({
      entity_links: { data: { from_id: "entity-a", to_id: "entity-b" } },
      entities: { data: null, error: { message: "endpoint query failed" } },
    });

    await expect(
      requireCodexLinkTarget(client as never, "link-a", "project-a"),
    ).resolves.toEqual({ error: "endpoint query failed" });
  });
});
