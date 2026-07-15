import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import type { Database } from "@/types/database.types";

export type IntegrationClient = SupabaseClient<Database>;

export type IntegrationEnv = {
  enabled: boolean;
  reason?: string;
  supabase?: IntegrationClient;
};

function isLocalUrl(url: string) {
  return (
    url.includes("127.0.0.1") ||
    url.includes("localhost") ||
    url.includes("host.docker.internal")
  );
}

export function getIntegrationEnv(): IntegrationEnv {
  if (process.env.SMART_WRITER_INTEGRATION_TESTS !== "1") {
    return {
      enabled: false,
      reason: "SMART_WRITER_INTEGRATION_TESTS=1 is not set",
    };
  }

  const url =
    process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      enabled: false,
      reason:
        "SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY are required",
    };
  }

  if (!isLocalUrl(url) && process.env.ALLOW_REMOTE_INTEGRATION_TESTS !== "1") {
    return {
      enabled: false,
      reason:
        "Refusing remote Supabase writes without ALLOW_REMOTE_INTEGRATION_TESTS=1",
    };
  }

  return {
    enabled: true,
    supabase: createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

export function describeIntegration(
  name: string,
  fn: (env: Required<Pick<IntegrationEnv, "supabase">>) => void
) {
  const env = getIntegrationEnv();
  const runner = env.enabled ? describe : describe.skip;

  runner(name, () => {
    if (!env.enabled || !env.supabase) {
      it(`skipped: ${env.reason}`, () => {});
      return;
    }

    fn({ supabase: env.supabase });
  });
}
