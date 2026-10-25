import { describe, expect, it } from "vitest";
import {
  parseCreateEntityLinkForm,
  parseEntityLinkUpdateInput,
  parseUpdateEntityForm,
  parseUpdateEntityInlineInput,
} from "@/app/(dashboard)/projects/[id]/codex-action-forms";

const projectId = "00000000-0000-4000-8000-000000000001";
const entityId = "00000000-0000-4000-8000-000000000002";
const otherEntityId = "00000000-0000-4000-8000-000000000003";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("Codex action input validation", () => {
  it("parses a bounded entity update", () => {
    const result = parseUpdateEntityForm(
      form({
        entityId,
        projectId,
        name: "  리엔  ",
        type: "CHARACTER",
        summary: "기사",
        aliases: "검은 기사, 북부 기사",
      })
    );

    expect(result).toEqual({
      ok: true,
      data: {
        entityId,
        projectId,
        name: "리엔",
        type: "CHARACTER",
        summary: "기사",
        aliases: ["검은 기사", "북부 기사"],
      },
    });
  });

  it("rejects invalid UUIDs and entity types", () => {
    expect(
      parseUpdateEntityForm(
        form({
          entityId: "not-a-uuid",
          projectId,
          name: "리엔",
          type: "HACKED",
          summary: "",
          aliases: "",
        })
      ).ok
    ).toBe(false);
  });

  it("rejects unknown relations, invalid direction, weight, and self links", () => {
    const base = {
      projectId,
      fromId: entityId,
      toId: otherEntityId,
      relationType: "ALLY",
      direction: "UNI",
      weight: "0.5",
    };

    expect(parseCreateEntityLinkForm(form({ ...base, relationType: "HACKED" })).ok).toBe(false);
    expect(parseCreateEntityLinkForm(form({ ...base, direction: "SIDEWAYS" })).ok).toBe(false);
    expect(parseCreateEntityLinkForm(form({ ...base, weight: "1.1" })).ok).toBe(false);
    expect(parseCreateEntityLinkForm(form({ ...base, toId: entityId })).ok).toBe(false);
    expect(parseCreateEntityLinkForm(form({ ...base, weight: "0" }))).toEqual({
      ok: true,
      data: { ...base, weight: 0 },
    });
  });

  it("accepts only known inline fields with bounded values", () => {
    expect(
      parseUpdateEntityInlineInput(entityId, projectId, {
        name: "  새 이름  ",
        aliases: ["별칭"],
      })
    ).toEqual({
      ok: true,
      data: {
        entityId,
        projectId,
        fields: { name: "새 이름", aliases: ["별칭"] },
      },
    });
    expect(
      parseUpdateEntityInlineInput(entityId, projectId, { admin: true })
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(parseUpdateEntityInlineInput(entityId, projectId, {})).toEqual(
      expect.objectContaining({ ok: false })
    );
  });

  it("validates direct relationship updates", () => {
    expect(parseEntityLinkUpdateInput(entityId, projectId, "ENEMY")).toEqual({
      ok: true,
      data: { linkId: entityId, projectId, relationType: "ENEMY" },
    });
    expect(parseEntityLinkUpdateInput(entityId, projectId, "UNKNOWN").ok).toBe(false);
  });
});
