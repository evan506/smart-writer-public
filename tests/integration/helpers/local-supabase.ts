import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type LocalSupabaseEnv =
  | {
      enabled: false;
      reason: string;
    }
  | {
      enabled: true;
      url: string;
      anonKey: string;
      serviceRoleKey: string;
      service: SupabaseClient<Database>;
    };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal", "::1"]);

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function client(url: string, key: string): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  if (process.env.SMART_WRITER_INTEGRATION_TESTS !== "1") {
    return {
      enabled: false,
      reason: "SMART_WRITER_INTEGRATION_TESTS=1 is not set",
    };
  }

  const url =
    process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return {
      enabled: false,
      reason:
        "SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and SUPABASE_TEST_SERVICE_ROLE_KEY are required",
    };
  }

  if (!isLocalSupabaseUrl(url)) {
    return {
      enabled: false,
      reason: `Refusing Search/RAG DB-backed runner against non-local Supabase URL: ${url}`,
    };
  }

  return {
    enabled: true,
    url,
    anonKey,
    serviceRoleKey,
    service: client(url, serviceRoleKey),
  };
}

export async function assertLocalSupabaseUrl(url: string): Promise<void> {
  if (!isLocalSupabaseUrl(url)) {
    throw new Error(`Refusing Supabase write against non-local URL: ${url}`);
  }
}

export async function createLocalOwnerClient(env: Extract<LocalSupabaseEnv, { enabled: true }>) {
  await assertLocalSupabaseUrl(env.url);

  const stamp = Date.now();
  const email = `smartwriter.rag.${stamp}@example.com`;
  const password = "SmartWriter-rag-integration-1234!";

  const { data: userData, error: createUserError } =
    await env.service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createUserError) throw createUserError;

  const owner = client(env.url, env.anonKey);
  const { error: signInError } = await owner.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    await env.service.auth.admin.deleteUser(userData.user.id);
    throw signInError;
  }

  return {
    email,
    password,
    userId: userData.user.id,
    client: owner,
  };
}
