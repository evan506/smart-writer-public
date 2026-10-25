import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupAuthenticatedE2E,
  getAuthE2EEnv,
  seedAuthenticatedE2E,
} from "../../e2e/helpers/auth-seed";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  deleteProjects: vi.fn(),
  failTable: "",
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.failTable = "";
  vi.stubEnv("SMART_WRITER_AUTH_E2E_TESTS", "1");
  vi.stubEnv("SUPABASE_TEST_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_TEST_ANON_KEY", "local-anon-key");
  vi.stubEnv("SUPABASE_TEST_SERVICE_ROLE_KEY", "local-service-key");
  vi.stubEnv("ALLOW_REMOTE_AUTH_E2E_TESTS", "");
  mocks.createUser.mockResolvedValue({ data: { user: { id: "fixture-user" } }, error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.deleteProjects.mockResolvedValue({ error: null });
  mocks.createClient.mockReturnValue({
    auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } },
    from: (table: string) => ({
      delete: () => ({ eq: mocks.deleteProjects }),
      insert: () => {
        const result = {
          error: mocks.failTable === table ? new Error(`${table} insert failed`) : null,
          data: table === "entities"
            ? ["리엔", "검은 서고", "검은 관리자", "별빛 정원"].map((name) => ({ id: name, name }))
            : { id: `${table}-id` },
        };
        if (["projects", "chapters"].includes(table)) {
          return { select: () => ({ single: async () => result }) };
        }
        if (table === "entities") return { select: async () => result };
        return Promise.resolve(result);
      },
    }),
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("authenticated E2E environment boundary", () => {
  it.each([
    "https://localhost.evil.example",
    "https://evil.example/127.0.0.1",
    "https://evil.example?next=localhost",
    "https://localhost@evil.example",
    "https://user:password@localhost",
    "file://localhost/database",
    "invalid URL",
  ])("rejects a URL that is not a local HTTP endpoint: %s", async (url) => {
    vi.stubEnv("SUPABASE_TEST_URL", url);
    expect(getAuthE2EEnv().enabled).toBe(false);
    expect(await seedAuthenticatedE2E()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321", "http://host.docker.internal:54321"])(
    "accepts an exact local host: %s", (url) => {
      vi.stubEnv("SUPABASE_TEST_URL", url);
      expect(getAuthE2EEnv().enabled).toBe(true);
    }
  );

  it("requires explicit opt-in before remote fixture writes", () => {
    vi.stubEnv("SUPABASE_TEST_URL", "https://test-project.supabase.co");
    expect(getAuthE2EEnv().enabled).toBe(false);
    vi.stubEnv("ALLOW_REMOTE_AUTH_E2E_TESTS", "1");
    expect(getAuthE2EEnv().enabled).toBe(true);
  });
});

describe("authenticated E2E fixture cleanup", () => {
  it.each(["projects", "chapters", "entities", "entity_links", "entity_suggestions", "fact_suggestions"])(
    "cleans the fixture owner after a partial %s setup failure", async (table) => {
      mocks.failTable = table;
      await expect(seedAuthenticatedE2E()).rejects.toThrow(`${table} insert failed`);
      expect(mocks.deleteProjects).toHaveBeenCalledWith("user_id", "fixture-user");
      expect(mocks.deleteUser).toHaveBeenCalledWith("fixture-user");
    }
  );

  it("cleans a complete seed and creates unique users across same-time runs", async () => {
    const first = await seedAuthenticatedE2E();
    const second = await seedAuthenticatedE2E();
    expect(first!.email).not.toBe(second!.email);
    await cleanupAuthenticatedE2E(first);
    expect(mocks.deleteProjects).toHaveBeenCalledWith("user_id", "fixture-user");
    expect(mocks.deleteUser).toHaveBeenCalledWith("fixture-user");
  });

  it("attempts user cleanup even when project cleanup throws, and reports both errors", async () => {
    const seed = await seedAuthenticatedE2E();
    const projectError = new Error("project cleanup unavailable");
    const userError = new Error("user cleanup unavailable");
    mocks.deleteProjects.mockRejectedValue(projectError);
    mocks.deleteUser.mockResolvedValue({ error: userError });
    await expect(cleanupAuthenticatedE2E(seed)).rejects.toMatchObject({
      errors: [projectError, userError],
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith("fixture-user");
  });

  it("preserves the setup error when cleanup also fails", async () => {
    mocks.failTable = "chapters";
    mocks.deleteUser.mockResolvedValue({ error: new Error("delete failed") });
    await expect(seedAuthenticatedE2E()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: "chapters insert failed" }), expect.any(AggregateError)],
    });
  });

  it("reports an unavailable cleanup environment instead of silently leaving a fixture", async () => {
    const seed = await seedAuthenticatedE2E();
    vi.stubEnv("SMART_WRITER_AUTH_E2E_TESTS", "");
    await expect(cleanupAuthenticatedE2E(seed)).rejects.toThrow("Cannot clean authenticated E2E user");
  });
});
