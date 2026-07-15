// E2E test-data cleanup — counterpart to scripts/e2e-seed.ts.
//
// Removes ONLY data created by the e2e seed, identified by the strict naming
// convention (see docs/qa/e2e-data-policy.md):
//   * projects with a title matching `% E2E %`  (seed: "<key> E2E <stamp>")
//   * auth users with email `smartwriter.e2e.%@example.com`  (admin only)
//
// Deleting a project cascades (ON DELETE CASCADE) to chapters, chunks,
// entities, entity_links, entity_suggestions, mentions, foreshadows,
// rag_logs and analysis_jobs, so projects are the only thing to delete.
//
// SAFETY: dry-run by default — it only PRINTS what would be deleted. Pass
// `--apply` to actually delete. Auth-user deletion additionally requires a
// service-role key (SUPABASE_SERVICE_ROLE_KEY); with only the anon key it
// can still delete projects owned by the *current* seed session but cannot
// remove auth users or other sessions' rows (RLS).
//
// Run:  npm run cleanup:e2e          (dry run)
//       npm run cleanup:e2e:apply    (perform deletion)

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.types";
import {
  E2E_TITLE_PATTERN,
  buildE2ECleanupPlan,
  filterE2EProjects,
  filterE2EUsers,
  shouldApplyE2ECleanup,
} from "../src/lib/services/e2e-data-safety-utils";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

async function main() {
  loadEnv();

  const apply = shouldApplyE2ECleanup(process.argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const usingAdmin = Boolean(serviceKey);

  const supabase = createClient<Database>(url, serviceKey ?? anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[e2e-cleanup] mode=${apply ? "APPLY (deleting)" : "DRY-RUN (no changes)"}` +
      ` key=${usingAdmin ? "service_role" : "anon"}`
  );

  // 1. Projects matching the e2e naming convention.
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, title, user_id, created_at")
    .ilike("title", E2E_TITLE_PATTERN)
    .order("created_at");

  if (projErr) {
    console.error("[e2e-cleanup] project query failed:", projErr.message);
    process.exit(1);
  }

  const e2eProjects = filterE2EProjects(projects ?? []);
  console.log(`[e2e-cleanup] matched ${e2eProjects.length} e2e project(s):`);
  for (const p of e2eProjects) {
    console.log(`  - ${p.title}  (id=${p.id}, user=${p.user_id})`);
  }

  // 2. Auth users (admin only).
  let e2eUsers: { id: string; email?: string | null }[] = [];
  if (usingAdmin) {
    const { data: list, error: usersErr } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (usersErr) {
      console.error("[e2e-cleanup] listUsers failed:", usersErr.message);
    } else {
      e2eUsers = filterE2EUsers(list.users);
      console.log(`[e2e-cleanup] matched ${e2eUsers.length} e2e auth user(s).`);
    }
  } else {
    console.log(
      "[e2e-cleanup] anon key: skipping auth-user cleanup (needs SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  const cleanupPlan = buildE2ECleanupPlan({
    projects: e2eProjects,
    users: e2eUsers,
    usingAdmin,
    apply,
  });

  if (!apply) {
    console.log(
      "[e2e-cleanup] DRY-RUN complete. Re-run with `npm run cleanup:e2e:apply` to delete."
    );
    return;
  }

  // 3. Delete projects (cascade handles all child rows).
  let deletedProjects = 0;
  for (const projectId of cleanupPlan.projectIds) {
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      console.error(`[e2e-cleanup] failed to delete project ${projectId}:`, error.message);
    } else {
      deletedProjects++;
    }
  }

  // 4. Delete auth users (admin only).
  let deletedUsers = 0;
  for (const uid of cleanupPlan.userIds) {
    const { error } = await supabase.auth.admin.deleteUser(uid);
    if (error) {
      console.error(`[e2e-cleanup] failed to delete user ${uid}:`, error.message);
    } else {
      deletedUsers++;
    }
  }

  console.log(
    `[e2e-cleanup] done. projects deleted=${deletedProjects}, auth users deleted=${deletedUsers}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
