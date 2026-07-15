import { describe, expect, it } from "vitest";
import {
  buildE2ECleanupPlan,
  buildE2ESeedOutput,
  createE2EEmail,
  filterE2EProjects,
  filterE2EUsers,
  isE2EAuthEmail,
  isE2EProjectTitle,
  shouldApplyE2ECleanup,
} from "@/lib/services/e2e-data-safety-utils";

describe("e2e data safety utils", () => {
  it("builds seed output with the expected email and project id shape", () => {
    const output = buildE2ESeedOutput({
      email: createE2EEmail(1779344199772),
      password: "SmartWriter-e2e-1234!",
      projects: {
        lastplayer: {
          id: "project-lastplayer",
          firstChapterId: "chapter-lastplayer-1",
        },
        blackiron: {
          id: "project-blackiron",
          firstChapterId: "chapter-blackiron-1",
        },
      },
    });

    expect(output).toEqual({
      email: "smartwriter.e2e.1779344199772@example.com",
      password: "SmartWriter-e2e-1234!",
      projects: {
        lastplayer: {
          id: "project-lastplayer",
          firstChapterId: "chapter-lastplayer-1",
        },
        blackiron: {
          id: "project-blackiron",
          firstChapterId: "chapter-blackiron-1",
        },
      },
    });
  });

  it("rejects seed output outside the e2e email convention", () => {
    expect(() =>
      buildE2ESeedOutput({
        email: "author@example.com",
        password: "pw",
        projects: {
          lastplayer: { id: "project-1", firstChapterId: "chapter-1" },
        },
      })
    ).toThrow("E2E seed email must use smartwriter.e2e.%@example.com");

    expect(() =>
      buildE2ESeedOutput({
        email: "smartwriter.e2e.1@example.com",
        password: "pw",
        projects: {
          lastplayer: { id: "", firstChapterId: "chapter-1" },
        },
      })
    ).toThrow("Missing e2e seed project identifiers for lastplayer");
  });

  it("matches only the e2e cleanup naming conventions", () => {
    expect(isE2EProjectTitle("마지막 플레이어 E2E 1779344199772")).toBe(true);
    expect(isE2EProjectTitle("마지막 플레이어 Demo 1779344199772")).toBe(false);
    expect(isE2EAuthEmail("smartwriter.e2e.1779344199772@example.com")).toBe(true);
    expect(isE2EAuthEmail("smartwriter.auth-e2e.1779344199772@example.com")).toBe(false);
    expect(isE2EAuthEmail("author@example.com")).toBe(false);
  });

  it("filters cleanup candidates before destructive deletes", () => {
    expect(
      filterE2EProjects([
        { id: "safe-project", title: "마지막 플레이어 E2E 1779344199772" },
        { id: "real-project", title: "마지막 플레이어 정식 원고" },
      ]).map((project) => project.id)
    ).toEqual(["safe-project"]);

    expect(
      filterE2EUsers([
        { id: "safe-user", email: "smartwriter.e2e.1779344199772@example.com" },
        { id: "real-user", email: "author@example.com" },
      ]).map((user) => user.id)
    ).toEqual(["safe-user"]);
  });

  it("keeps cleanup dry-run by default and omits auth users without admin", () => {
    expect(shouldApplyE2ECleanup(["node", "scripts/e2e-cleanup.ts"])).toBe(false);
    expect(shouldApplyE2ECleanup(["node", "scripts/e2e-cleanup.ts", "--apply"])).toBe(true);

    expect(
      buildE2ECleanupPlan({
        apply: false,
        usingAdmin: false,
        projects: [
          { id: "safe-project", title: "흑철기사단 E2E 1779344199772" },
          { id: "real-project", title: "흑철기사단 본편" },
        ],
        users: [
          { id: "safe-user", email: "smartwriter.e2e.1779344199772@example.com" },
        ],
      })
    ).toEqual({
      mode: "DRY_RUN",
      projectIds: ["safe-project"],
      userIds: [],
    });
  });

  it("includes only e2e projects and users in apply cleanup plans", () => {
    expect(
      buildE2ECleanupPlan({
        apply: true,
        usingAdmin: true,
        projects: [
          { id: "safe-project", title: "마지막 플레이어 E2E 1779344199772" },
          { id: "real-project", title: "마지막 플레이어" },
        ],
        users: [
          { id: "safe-user", email: "smartwriter.e2e.1779344199772@example.com" },
          { id: "real-user", email: "author@example.com" },
        ],
      })
    ).toEqual({
      mode: "APPLY",
      projectIds: ["safe-project"],
      userIds: ["safe-user"],
    });
  });
});
