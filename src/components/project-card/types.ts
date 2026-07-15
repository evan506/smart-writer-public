export interface ProjectCardData {
  id: string;
  title: string;
  genre: string | null;
  description: string | null;
  entityCount: number;
  chapterCount: number;
  wordCount: number;
  pendingCount: number;
  lastChapter: {
    chapterNum: number;
    title: string | null;
    updatedAt: string;
  } | null;
  isRecentlyActive: boolean;
}
