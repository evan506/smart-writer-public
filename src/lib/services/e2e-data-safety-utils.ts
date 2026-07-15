export const E2E_TITLE_PATTERN = "% E2E %";
export const E2E_EMAIL_PATTERN = "smartwriter.e2e.%@example.com";

export type E2EProjectCandidate = {
  id: string;
  title: string;
  user_id?: string | null;
  created_at?: string | null;
};

export type E2EUserCandidate = {
  id: string;
  email?: string | null;
};

export type E2ESeedProjectOutput = {
  id: string;
  firstChapterId: string;
};

export type E2ESeedOutput = {
  email: string;
  password: string;
  projects: Record<string, E2ESeedProjectOutput>;
};

export function createE2EEmail(stamp: number | string) {
  return `smartwriter.e2e.${stamp}@example.com`;
}

export function isE2EProjectTitle(title: string) {
  return /\bE2E\b/.test(title);
}

export function buildE2EEmailRegex() {
  return new RegExp(
    "^" + E2E_EMAIL_PATTERN.replace(/[.]/g, "\\.").replace(/%/g, ".*") + "$"
  );
}

export function isE2EAuthEmail(email: string | null | undefined) {
  return Boolean(email && buildE2EEmailRegex().test(email));
}

export function shouldApplyE2ECleanup(args: string[]) {
  return args.includes("--apply");
}

export function filterE2EProjects<T extends E2EProjectCandidate>(projects: T[]) {
  return projects.filter((project) => isE2EProjectTitle(project.title));
}

export function filterE2EUsers<T extends E2EUserCandidate>(users: T[]) {
  return users.filter((user) => isE2EAuthEmail(user.email));
}

export function buildE2ECleanupPlan(input: {
  projects: E2EProjectCandidate[];
  users: E2EUserCandidate[];
  usingAdmin: boolean;
  apply: boolean;
}) {
  const projects = filterE2EProjects(input.projects);
  const users = input.usingAdmin ? filterE2EUsers(input.users) : [];

  return {
    mode: input.apply ? "APPLY" : "DRY_RUN",
    projectIds: projects.map((project) => project.id),
    userIds: users.map((user) => user.id),
  };
}

export function buildE2ESeedOutput(input: {
  email: string;
  password: string;
  projects: Record<string, E2ESeedProjectOutput>;
}): E2ESeedOutput {
  if (!isE2EAuthEmail(input.email)) {
    throw new Error("E2E seed email must use smartwriter.e2e.%@example.com");
  }

  for (const [key, project] of Object.entries(input.projects)) {
    if (!project.id || !project.firstChapterId) {
      throw new Error(`Missing e2e seed project identifiers for ${key}`);
    }
  }

  return {
    email: input.email,
    password: input.password,
    projects: input.projects,
  };
}
