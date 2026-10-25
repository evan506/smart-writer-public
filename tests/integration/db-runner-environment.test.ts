import { describe, expect, it } from "vitest";
import { getLocalSupabaseEnv } from "./helpers/local-supabase";

const required = process.env.SMART_WRITER_INTEGRATION_TESTS === "1";
const testCase = required ? it : it.skip;

describe("DB-backed integration runner", () => {
  testCase("has a complete local-only Supabase environment", () => {
    const env = getLocalSupabaseEnv();
    expect(env.enabled, env.enabled ? undefined : env.reason).toBe(true);
  });
});
