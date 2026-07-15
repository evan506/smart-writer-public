export type PlanningNotice = {
  tone: "success" | "error" | "info";
  text: string;
};

export type PendingAction = "save" | "create" | "delete" | "link" | "unlink" | null;
