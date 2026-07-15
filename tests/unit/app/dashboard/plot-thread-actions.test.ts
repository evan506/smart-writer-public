import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const requireProjectOwnerMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProjectOwner: requireProjectOwnerMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type Result = { data?: unknown; error?: unknown };

// A chainable Supabase mock that consumes one queued Result per `.from(table)`
// call (in order), supporting both terminal (.maybeSingle/.single) and
// awaited-chain resolution.
function makeClient(queues: Record<string, Result[]>) {
  const fromCalls: string[] = [];
  const inserts: Array<{ table: string; values: unknown }> = [];

  function chain(table: string, result: Result) {
    const promise = Promise.resolve(result);
    const c: Record<string, unknown> = {
      select: () => c,
      insert: (values: unknown) => {
        inserts.push({ table, values });
        return c;
      },
      update: () => c,
      delete: () => c,
      eq: () => c,
      in: () => c,
      not: () => c,
      order: () => c,
      limit: () => c,
      maybeSingle: () => promise,
      single: () => promise,
      then: (resolve: (v: Result) => unknown) => promise.then(resolve),
    };
    return c;
  }

  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      const queue = queues[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return chain(table, next);
    }),
  };

  return { client, fromCalls, inserts };
}

const projectId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const blockId = "33333333-3333-4333-8333-333333333333";
const chapterId = "44444444-4444-4444-8444-444444444444";

async function importActions() {
  return import("@/app/(dashboard)/projects/[id]/plot-thread-actions");
}

describe("plot-thread server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
  });

  it("createPlotThread inserts at the next position and returns the id", async () => {
    const { client, inserts } = makeClient({
      plot_threads: [
        { data: { position: 2 }, error: null }, // last position lookup
        { data: { id: "new-thread" }, error: null }, // insert
      ],
    });
    createClientMock.mockResolvedValue(client);

    const { createPlotThread } = await importActions();
    const result = await createPlotThread({
      projectId,
      title: "황태자 암살 음모",
      summary: null,
    });

    expect(result).toEqual({ error: null, id: "new-thread" });
    expect(inserts[0].values).toMatchObject({
      project_id: projectId,
      title: "황태자 암살 음모",
      position: 3,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/projects/${projectId}/planning`
    );
  });

  it("createPlotThread blocks when ownership fails", async () => {
    const { client } = makeClient({});
    createClientMock.mockResolvedValue(client);
    requireProjectOwnerMock.mockResolvedValue({
      ok: false,
      error: "권한이 없거나 존재하지 않는 프로젝트입니다",
    });

    const { createPlotThread } = await importActions();
    const result = await createPlotThread({ projectId, title: "x", summary: null });

    expect(result.error).toBe("권한이 없거나 존재하지 않는 프로젝트입니다");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("createPlotThread rejects an empty title via zod", async () => {
    const { client } = makeClient({});
    createClientMock.mockResolvedValue(client);

    const { createPlotThread } = await importActions();
    const result = await createPlotThread({ projectId, title: "   ", summary: null });

    expect(result.id).toBeNull();
    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("linkThreadToPlanningBlock rejects a non-row card kind", async () => {
    const { client, inserts } = makeClient({
      plot_threads: [{ data: { id: threadId }, error: null }],
      planning_blocks: [{ data: { id: blockId, kind: "CHARACTER_PLAN" }, error: null }],
    });
    createClientMock.mockResolvedValue(client);

    const { linkThreadToPlanningBlock } = await importActions();
    const result = await linkThreadToPlanningBlock({
      projectId,
      threadId,
      planningBlockId: blockId,
    });

    expect(result.error).toContain("플롯 스레드에 연결할 수 있습니다");
    expect(inserts).toHaveLength(0);
  });

  it("linkThreadToPlanningBlock rejects a cross-project / missing block", async () => {
    const { client } = makeClient({
      plot_threads: [{ data: { id: threadId }, error: null }],
      planning_blocks: [{ data: null, error: null }],
    });
    createClientMock.mockResolvedValue(client);

    const { linkThreadToPlanningBlock } = await importActions();
    const result = await linkThreadToPlanningBlock({
      projectId,
      threadId,
      planningBlockId: blockId,
    });

    expect(result.error).toBe("연결할 구상 카드를 찾을 수 없습니다");
  });

  it("linkThreadToPlanningBlock rejects a thread from another project", async () => {
    const { client } = makeClient({
      plot_threads: [{ data: null, error: null }],
    });
    createClientMock.mockResolvedValue(client);

    const { linkThreadToPlanningBlock } = await importActions();
    const result = await linkThreadToPlanningBlock({
      projectId,
      threadId,
      planningBlockId: blockId,
    });

    expect(result.error).toBe("플롯 스레드를 찾을 수 없습니다");
  });

  it("linkThreadToPlanningBlock is idempotent on a unique violation", async () => {
    const { client } = makeClient({
      plot_threads: [{ data: { id: threadId }, error: null }],
      planning_blocks: [{ data: { id: blockId, kind: "EVENT" }, error: null }],
      plot_thread_planning_blocks: [
        { data: { position: 0 }, error: null }, // last position
        { data: null, error: { code: "23505", message: "duplicate" } }, // insert
      ],
    });
    createClientMock.mockResolvedValue(client);

    const { linkThreadToPlanningBlock } = await importActions();
    const result = await linkThreadToPlanningBlock({
      projectId,
      threadId,
      planningBlockId: blockId,
    });

    expect(result).toEqual({ error: null });
  });

  it("linkThreadToChapter rejects a chapter from another project", async () => {
    const { client } = makeClient({
      plot_threads: [{ data: { id: threadId }, error: null }],
      chapters: [{ data: null, error: null }],
    });
    createClientMock.mockResolvedValue(client);

    const { linkThreadToChapter } = await importActions();
    const result = await linkThreadToChapter({ projectId, threadId, chapterId });

    expect(result.error).toBe("연결할 회차를 찾을 수 없습니다");
  });

  it("updatePlotThread returns not-found when no row matches", async () => {
    const { client } = makeClient({
      plot_threads: [{ data: null, error: null }],
    });
    createClientMock.mockResolvedValue(client);

    const { updatePlotThread } = await importActions();
    const result = await updatePlotThread({
      projectId,
      threadId,
      title: "수정",
      summary: null,
    });

    expect(result.error).toBe("플롯 스레드를 찾을 수 없습니다");
  });

  it("deletePlotThread succeeds and revalidates", async () => {
    const { client } = makeClient({
      plot_threads: [{ data: null, error: null }],
    });
    createClientMock.mockResolvedValue(client);

    const { deletePlotThread } = await importActions();
    const result = await deletePlotThread({ projectId, threadId });

    expect(result).toEqual({ error: null });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/projects/${projectId}/planning`
    );
  });
});
