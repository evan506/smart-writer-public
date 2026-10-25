import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/services", () => ({}));
vi.mock("@/lib/services/chapter-create", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/services/chapter-create")>(), createChapterSafely: mocks.create }));
import { createChapter } from "@/app/(dashboard)/projects/[id]/chapters-actions";
const projectId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ projectId, requestId, title: "", ...values }).forEach(([key, value]) => data.set(key, value));
  return data;
}
describe("createChapter server boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  const invalidInputs: Record<string, string>[] = [
    { projectId: "bad" },
    { requestId: "bad" },
    { title: "가".repeat(501) },
  ];
  it.each(invalidInputs)("validates before creating a database client", async (invalid) => {
    expect((await createChapter(form(invalid))).error).toContain("올바르지");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes the request identity and ignores untrusted client numbering", async () => {
    const client = {};
    const result = { error: null, id: requestId, chapter: { id: requestId, chapter_num: 9 } };
    mocks.client.mockResolvedValue(client);
    mocks.create.mockResolvedValue(result);
    expect(await createChapter(form({ chapterNum: "-999" }))).toEqual(result);
    expect(mocks.create).toHaveBeenCalledWith(client, { projectId, requestId, title: "" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
