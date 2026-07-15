import { describe, expect, it, vi } from "vitest";
import {
  requireChapterOwner,
  requireProjectOwner,
  requireUser,
} from "@/lib/auth/ownership";

type EqCall = { column: string; value: unknown };
type QueryRecord = { table: string; eq: EqCall[]; select?: string };

function createOwnershipClient({
  userId,
  projects = [],
  chapters = [],
}: {
  userId: string | null;
  projects?: { id: string; user_id: string }[];
  chapters?: { id: string; project_id: string }[];
}) {
  const queries: QueryRecord[] = [];

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
      })),
    },
    from: vi.fn((table: string) => {
      const record: QueryRecord = { table, eq: [] };
      queries.push(record);

      const builder = {
        select(columns: string) {
          record.select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          record.eq.push({ column, value });
          return builder;
        },
        async maybeSingle() {
          const id = record.eq.find((call) => call.column === "id")?.value;

          if (table === "projects") {
            const ownerId = record.eq.find((call) => call.column === "user_id")?.value;
            const project = projects.find(
              (row) => row.id === id && row.user_id === ownerId
            );
            return { data: project ? { id: project.id } : null, error: null };
          }

          if (table === "chapters") {
            const chapter = chapters.find((row) => row.id === id);
            return {
              data: chapter ? { project_id: chapter.project_id } : null,
              error: null,
            };
          }

          return { data: null, error: null };
        },
      };

      return builder;
    }),
  };

  return { client, queries };
}

describe("ownership guards", () => {
  it("requires an authenticated user before checking ownership", async () => {
    const { client } = createOwnershipClient({ userId: null });

    await expect(requireUser(client as never)).resolves.toEqual({
      ok: false,
      error: "인증이 필요합니다",
    });

    await expect(requireProjectOwner(client as never, "project-a")).resolves.toEqual({
      ok: false,
      error: "인증이 필요합니다",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("accepts only projects whose user_id matches the authenticated user", async () => {
    const { client, queries } = createOwnershipClient({
      userId: "user-a",
      projects: [
        { id: "project-a", user_id: "user-a" },
        { id: "project-b", user_id: "user-b" },
      ],
    });

    await expect(requireProjectOwner(client as never, "project-a")).resolves.toEqual({
      ok: true,
      userId: "user-a",
    });
    await expect(requireProjectOwner(client as never, "project-b")).resolves.toEqual({
      ok: false,
      error: "권한이 없거나 존재하지 않는 프로젝트입니다",
    });

    expect(queries).toContainEqual({
      table: "projects",
      select: "id",
      eq: [
        { column: "id", value: "project-a" },
        { column: "user_id", value: "user-a" },
      ],
    });
    expect(queries).toContainEqual({
      table: "projects",
      select: "id",
      eq: [
        { column: "id", value: "project-b" },
        { column: "user_id", value: "user-a" },
      ],
    });
  });

  it("blocks chapters when their parent project belongs to another user", async () => {
    const { client, queries } = createOwnershipClient({
      userId: "user-a",
      projects: [{ id: "other-project", user_id: "user-b" }],
      chapters: [{ id: "chapter-b", project_id: "other-project" }],
    });

    await expect(requireChapterOwner(client as never, "chapter-b")).resolves.toEqual({
      ok: false,
      error: "권한이 없거나 존재하지 않는 챕터입니다",
    });

    expect(queries).toEqual([
      {
        table: "chapters",
        select: "project_id",
        eq: [{ column: "id", value: "chapter-b" }],
      },
      {
        table: "projects",
        select: "id",
        eq: [
          { column: "id", value: "other-project" },
          { column: "user_id", value: "user-a" },
        ],
      },
    ]);
  });
});
