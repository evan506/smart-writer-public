import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type AuthE2EEnv =
  | {
      enabled: false;
      reason: string;
    }
  | {
      enabled: true;
      url: string;
      anonKey: string;
      serviceKey: string;
    };

export type AuthSeed = {
  email: string;
  password: string;
  userId: string;
  projectId: string;
  chapterId: string;
  entityIds: {
    rien: string;
    blackArchive: string;
    blackCustodian: string;
    starlightGarden: string;
  };
  projectTitle: string;
  chapterTitle: string;
  chapterContent: string;
};

function isLocalUrl(url: string) {
  return (
    url.includes("127.0.0.1") ||
    url.includes("localhost") ||
    url.includes("host.docker.internal")
  );
}

export function getAuthE2EEnv(): AuthE2EEnv {
  if (process.env.SMART_WRITER_AUTH_E2E_TESTS !== "1") {
    return {
      enabled: false,
      reason: "SMART_WRITER_AUTH_E2E_TESTS=1 is not set",
    };
  }

  const url =
    process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return {
      enabled: false,
      reason:
        "SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and SUPABASE_TEST_SERVICE_ROLE_KEY are required",
    };
  }

  if (!isLocalUrl(url) && process.env.ALLOW_REMOTE_AUTH_E2E_TESTS !== "1") {
    return {
      enabled: false,
      reason:
        "Refusing remote Supabase writes without ALLOW_REMOTE_AUTH_E2E_TESTS=1",
    };
  }

  return { enabled: true, url, anonKey, serviceKey };
}

function serviceClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function seedAuthenticatedE2E(): Promise<AuthSeed | null> {
  const env = getAuthE2EEnv();
  if (!env.enabled) return null;

  const supabase = serviceClient(env.url, env.serviceKey);
  const stamp = Date.now();
  const email = `smartwriter.e2e.auth.${stamp}@example.com`;
  const password = "SmartWriter-auth-e2e-1234!";
  const projectTitle = `인증 E2E 프로젝트 ${stamp}`;
  const chapterTitle = "첫 장면";
  const chapterContent =
    "리엔은 검은 서고에서 오래된 단서를 발견했다. 렌은 검은 관리자에게 비밀을 숨겼다. 푸른 문은 다음 장면의 단서로 등장했다. 별빛 정원은 아직 아무 관계도 없다.";

  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError) throw userError;

  const userId = userData.user.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: projectTitle,
      genre: "판타지",
      description: "authenticated e2e fixture",
      metadata: { testRun: "auth-e2e", stamp },
    })
    .select("id")
    .single();
  if (projectError) throw projectError;

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({
      project_id: project.id,
      chapter_num: 1,
      title: chapterTitle,
      content: chapterContent,
      word_count: chapterContent.replace(/\s/g, "").length,
    })
    .select("id")
    .single();
  if (chapterError) throw chapterError;

  const { data: entities, error: entityError } = await supabase
    .from("entities")
    .insert([
      {
        project_id: project.id,
        name: "리엔",
        type: "CHARACTER",
        summary: "인증 e2e용 인물",
        aliases: ["렌"],
        metadata: { importance: "MAIN" },
      },
      {
        project_id: project.id,
        name: "검은 서고",
        type: "PLACE",
        summary: "인증 e2e용 장소",
        aliases: [],
        metadata: { importance: "SUPPORTING" },
      },
      {
        project_id: project.id,
        name: "검은 관리자",
        type: "ORGANIZATION",
        summary: "인증 e2e용 관계 대상",
        aliases: [],
        metadata: { importance: "SUPPORTING" },
      },
      {
        project_id: project.id,
        name: "별빛 정원",
        type: "PLACE",
        summary: "인증 e2e용 필터 빈 상태 대상",
        aliases: [],
        metadata: { importance: "MINOR" },
      },
    ])
    .select("id, name");
  if (entityError) throw entityError;
  if (!entities) throw new Error("Failed to create authenticated e2e entities");

  const entityIds = {
    rien: entities.find((entity) => entity.name === "리엔")!.id,
    blackArchive: entities.find((entity) => entity.name === "검은 서고")!.id,
    blackCustodian: entities.find((entity) => entity.name === "검은 관리자")!.id,
    starlightGarden: entities.find((entity) => entity.name === "별빛 정원")!.id,
  };

  const { error: linkError } = await supabase.from("entity_links").insert({
    from_id: entityIds.rien,
    to_id: entityIds.blackCustodian,
    relation_type: "ALLY",
    direction: "BI",
    description: "focused write workspace QA relation",
    weight: 1,
  });
  if (linkError) throw linkError;

  const { error: suggestionError } = await supabase
    .from("entity_suggestions")
    .insert([
      {
        project_id: project.id,
        chapter_id: chapter.id,
        name: "푸른 문",
        type: "PLACE",
        summary: "다음 장면의 단서로 등장하는 장소 후보",
        aliases: [],
        confidence: 0.81,
        context_snippet: "푸른 문은 다음 장면의 단서로 등장했다.",
        status: "PENDING",
        suggested_action: "CREATE",
      },
      {
        project_id: project.id,
        chapter_id: chapter.id,
        name: "리엔 → 검은 서고",
        type: "RELATION",
        summary: "LOCATED_IN",
        aliases: {
          from_name: "리엔",
          to_name: "검은 서고",
          relation_type: "LOCATED_IN",
          direction: "UNI",
          weight: 0.9,
        },
        confidence: 0.86,
        context_snippet: "리엔은 검은 서고에서 오래된 단서를 발견했다.",
        status: "PENDING",
        suggested_action: "CREATE",
      },
    ]);
  if (suggestionError) throw suggestionError;

  const { error: factSuggestionError } = await supabase
    .from("fact_suggestions")
    .insert({
      project_id: project.id,
      chapter_id: chapter.id,
      matched_entity_id: entityIds.rien,
      fact_type: "STATE",
      fact_key: "secret",
      value: "검은 관리자에게 비밀을 숨기고 있다",
      evidence_text: "렌은 검은 관리자에게 비밀을 숨겼다.",
      confidence: 0.84,
      status: "PENDING",
    });
  if (factSuggestionError) throw factSuggestionError;

  return {
    email,
    password,
    userId,
    projectId: project.id,
    chapterId: chapter.id,
    entityIds,
    projectTitle,
    chapterTitle,
    chapterContent,
  };
}

export async function cleanupAuthenticatedE2E(seed: AuthSeed | null) {
  if (!seed) return;

  const env = getAuthE2EEnv();
  if (!env.enabled) return;

  const supabase = serviceClient(env.url, env.serviceKey);
  await supabase.from("projects").delete().eq("id", seed.projectId);
  await supabase.auth.admin.deleteUser(seed.userId);
}
