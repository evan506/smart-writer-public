import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminUser, requireAdmin } from "@/lib/auth/admin";

const adminId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function client(user: { id: string; email?: string } | null, error: unknown = null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error }) }, from: vi.fn(), rpc: vi.fn() };
}

describe("administrator allowlist", () => {
  it("has no default administrator when unset or malformed", () => {
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", "");
    expect(isAdminUser(adminId)).toBe(false);
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", "invalid,admin@example.com,*,null");
    expect(isAdminUser(adminId)).toBe(false);
    for (const id of [undefined, null, "", "admin@example.com", "invalid"]) expect(isAdminUser(id)).toBe(false);
  });

  it("accepts exact UUIDs in a whitespace-separated comma list only", () => {
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", `invalid, ${adminId.toUpperCase()} , AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA ,invalid`);
    expect(isAdminUser(adminId)).toBe(true);
    expect(isAdminUser("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
    expect(isAdminUser(otherId)).toBe(false);
    expect(isAdminUser(adminId.slice(0, -1))).toBe(false);
  });

  it("does not elevate a privileged-looking email", async () => {
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", adminId);
    const supabase = client({ id: otherId, email: "admin@smartwriter.com" });
    expect(await requireAdmin(supabase as never)).toEqual({ kind: "forbidden" });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns the verified allowed user ID", async () => {
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", adminId);
    expect(await requireAdmin(client({ id: adminId }) as never))
      .toEqual({ kind: "authorized", userId: adminId });
  });

  it.each([null, { id: adminId }])("fails closed on auth errors for %j", async (user) => {
    vi.stubEnv("SMART_WRITER_ADMIN_USER_IDS", adminId);
    const supabase = client(user, { message: "auth failure" });
    expect(await requireAdmin(supabase as never)).toEqual({ kind: "unauthenticated" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("handles missing users and thrown auth errors safely", async () => {
    expect(await requireAdmin(client(null) as never)).toEqual({ kind: "unauthenticated" });
    const supabase = client(null);
    supabase.auth.getUser.mockRejectedValue(new Error("sensitive auth details"));
    expect(await requireAdmin(supabase as never)).toEqual({ kind: "unauthenticated" });
  });
});
