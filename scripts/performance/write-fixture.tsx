// Local synthetic fixture: real workspace/editor, deterministic action stubs.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { WriteWorkspace } from "@/components/write/write-workspace";
import { WriteSidebarProvider } from "@/components/write/write-sidebar-context";
import { SidebarProvider } from "@/components/ui/sidebar";
import { WriteChapterSidebar } from "@/components/app-sidebar/write-chapter-sidebar";
import type { Chapter } from "@/types";

const params = new URLSearchParams(location.search);
const length = Number(params.get("length") ?? 5000);
const entityCount = Number(params.get("entities") ?? 100);
const entities = Array.from({ length: entityCount }, (_, i) => ({
  id: `entity-${i}`, name: `인물${String(i).padStart(3, "0")}`, type: "CHARACTER", aliases: [`별칭${i}`],
}));
Object.assign(window, { fixtureEntities: entities, saveCalls: [] });
const text = Array.from({ length: Math.ceil(length / 60) }, (_, i) =>
  `인물${String(i % Math.max(entityCount, 1)).padStart(3, "0")}은 오래된 성문 앞에서 잠시 걸음을 멈추었다. 바람이 불어왔다. 별칭${i % Math.max(entityCount, 1)}의 이야기였다.`
).join("\n\n").slice(0, length);
const chapters = Array.from({ length: 100 }, (_, i) => ({
  id: `chapter-${i}`, chapter_num: i + 1, project_id: "fixture", title: `${i + 1}화`, content: i === 0 ? text : "다른 회차 원고", word_count: 10,
})) as Chapter[];
function Fixture() {
  useEffect(() => { document.documentElement.dataset.ready = "true"; }, []);
  return <WriteSidebarProvider><SidebarProvider><aside style={{ width: params.has("styled") ? 256 : 200, flexShrink: 0 }}><WriteChapterSidebar expanded /></aside>
    <main style={{ display: "flex", height: "100vh", flex: 1, minWidth: 0 }}>
      <WriteWorkspace projectId="fixture" projectName="성능 확인용 가상 작품" projectGenre={null} initialChapters={chapters} />
    </main></SidebarProvider></WriteSidebarProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
