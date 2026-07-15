import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCodexData } from "@/app/(dashboard)/projects/[id]/codex-actions";
import { CodexFullPage } from "@/components/codex-full-page";

export const dynamic = "force-dynamic";

export default async function CodexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const projectRes = await supabase
    .from("projects")
    .select("id, title, genre")
    .eq("id", id)
    .single();

  if (!projectRes.data) notFound();

  const { entities, pendingEntities, links, relationEvidence, entityChapters, entityEvidence, entityForeshadows, entityFacts, pendingSuggestions, unmatchedSuggestionCount, totalChapters } =
    await getCodexData(id);

  return (
    <CodexFullPage
      projectId={id}
      projectTitle={projectRes.data.title}
      entities={entities}
      pendingEntities={pendingEntities}
      links={links}
      relationEvidence={relationEvidence}
      entityChapters={entityChapters}
      entityEvidence={entityEvidence}
      entityForeshadows={entityForeshadows}
      entityFacts={entityFacts}
      pendingSuggestions={pendingSuggestions}
      unmatchedSuggestionCount={unmatchedSuggestionCount}
      totalChapters={totalChapters}
    />
  );
}
