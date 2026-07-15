import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const requireProjectOwnerMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProjectOwner: requireProjectOwnerMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

describe("planning server actions", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const blockId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireProjectOwnerMock.mockResolvedValue({ ok: true, userId: "user-1" });
  });

  it("does not create default blocks when project ownership fails", async () => {
    const client = { from: vi.fn() };
    createClientMock.mockResolvedValue(client);
    requireProjectOwnerMock.mockResolvedValue({
      ok: false,
      error: "권한이 없거나 존재하지 않는 프로젝트입니다",
    });

    const { ensureDefaultPlanningBlocks } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await ensureDefaultPlanningBlocks(projectId);

    expect(result).toEqual({
      error: "권한이 없거나 존재하지 않는 프로젝트입니다",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("lazily inserts the four missing root planning blocks", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
        insert: insertMock,
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { ensureDefaultPlanningBlocks } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await ensureDefaultPlanningBlocks(projectId);

    expect(result).toEqual({ error: null });
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({ title: "시작", structure_key: "START", position: 0 }),
      expect.objectContaining({
        title: "전개",
        structure_key: "DEVELOPMENT",
        position: 1,
      }),
      expect.objectContaining({ title: "전환", structure_key: "TURN", position: 2 }),
      expect.objectContaining({ title: "결말", structure_key: "ENDING", position: 3 }),
    ]);
  });

  it("skips existing default root blocks", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn().mockResolvedValue({
              data: [
                { structure_key: "START" },
                { structure_key: "DEVELOPMENT" },
                { structure_key: "TURN" },
                { structure_key: "ENDING" },
              ],
              error: null,
            }),
          })),
        })),
        insert: insertMock,
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { ensureDefaultPlanningBlocks } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await ensureDefaultPlanningBlocks(projectId);

    expect(result).toEqual({ error: null });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns a deployment-friendly message when planning tables are missing", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: "PGRST205",
                message:
                  "Could not find the table 'public.planning_blocks' in the schema cache",
              },
            }),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { ensureDefaultPlanningBlocks } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await ensureDefaultPlanningBlocks(projectId);

    expect(result).toEqual({
      error:
        "구상 데이터베이스가 아직 준비되지 않았습니다. Supabase에 20260601120000_v2_progressive_planning migration을 적용한 뒤 다시 시도해주세요.",
    });
  });

  it("returns not found when updating a missing planning block", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: maybeSingleMock,
              })),
            })),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { updatePlanningBlock } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await updatePlanningBlock({
      blockId,
      projectId,
      title: "전개",
      summary: null,
      notes: null,
      status: "PLANNED",
    });

    expect(result).toEqual({ error: "구상 블록을 찾을 수 없습니다" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects invalid project ids before touching storage", async () => {
    const client = { from: vi.fn() };
    createClientMock.mockResolvedValue(client);

    const { updatePlanningBlock } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await updatePlanningBlock({
      blockId,
      projectId: "not-a-project-id",
      title: "시작",
      summary: null,
      notes: null,
      status: "PLANNED",
    });

    expect(result.error).toBeTruthy();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("promotes a parent block only when it is still planned after adding a child", async () => {
    const statusEqMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "ROOT" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { position: 2 },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "33333333-3333-4333-8333-333333333333" },
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: statusEqMock,
              })),
            })),
          })),
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { createPlanningChildBlock } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await createPlanningChildBlock({
      projectId,
      parentId: blockId,
      kind: "EPISODE",
      title: "첫 폭주",
      summary: null,
    });

    expect(result).toEqual({
      error: null,
      id: "33333333-3333-4333-8333-333333333333",
    });
    expect(statusEqMock).toHaveBeenCalledWith("status", "PLANNED");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("allows creating a planning card under a non-root parent", async () => {
    const statusEqMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "EPISODE" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "44444444-4444-4444-8444-444444444444" },
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: statusEqMock,
              })),
            })),
          })),
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { createPlanningChildBlock } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await createPlanningChildBlock({
      projectId,
      parentId: blockId,
      kind: "CHAPTER",
      title: "1화",
      summary: "첫 조우",
    });

    expect(result).toEqual({
      error: null,
      id: "44444444-4444-4444-8444-444444444444",
    });
    expect(statusEqMock).toHaveBeenCalledWith("status", "PLANNED");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("links a chapter planning card to an existing manuscript chapter", async () => {
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const chapterId = "55555555-5555-4555-8555-555555555555";
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "CHAPTER" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: chapterId },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: deleteEqMock,
                })),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: insertMock,
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToChapter } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToChapter({
      projectId,
      planningBlockId: blockId,
      chapterId,
    });

    expect(result).toEqual({ error: null });
    expect(insertMock).toHaveBeenCalledWith({
      project_id: projectId,
      planning_block_id: blockId,
      target_type: "chapter",
      target_id: chapterId,
      link_kind: "PLANNED_FOR",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("rejects manuscript chapter references from non-chapter planning cards", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: blockId, kind: "EPISODE" },
                error: null,
              }),
            })),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToChapter } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToChapter({
      projectId,
      planningBlockId: blockId,
      chapterId: "55555555-5555-4555-8555-555555555555",
    });

    expect(result).toEqual({
      error: "화 카드에서만 기존 회차를 참조할 수 있습니다",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete root planning blocks", async () => {
    const deleteMock = vi.fn();
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { kind: "ROOT" },
                error: null,
              }),
            })),
          })),
        })),
        delete: deleteMock,
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { deletePlanningBlock } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await deletePlanningBlock({ projectId, blockId });

    expect(result).toEqual({ error: "기본 4블록은 삭제할 수 없습니다" });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deletes non-root planning cards and revalidates the planning page", async () => {
    const finalDeleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { kind: "EPISODE" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: finalDeleteEqMock,
            })),
          })),
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { deletePlanningBlock } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await deletePlanningBlock({ projectId, blockId });

    expect(result).toEqual({ error: null });
    expect(finalDeleteEqMock).toHaveBeenCalledWith("project_id", projectId);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("unlinks a chapter reference from the selected planning card", async () => {
    const chapterId = "55555555-5555-4555-8555-555555555555";
    const finalEqMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: finalEqMock,
                })),
              })),
            })),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { unlinkPlanningBlockFromChapter } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await unlinkPlanningBlockFromChapter({
      projectId,
      planningBlockId: blockId,
      chapterId,
    });

    expect(result).toEqual({ error: null });
    expect(finalEqMock).toHaveBeenCalledWith("link_kind", "PLANNED_FOR");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("links a planning card to an existing Codex entity", async () => {
    const entityId = "66666666-6666-4666-8666-666666666666";
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "CHARACTER_PLAN" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: entityId },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: insertMock,
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToEntity({
      projectId,
      planningBlockId: blockId,
      entityId,
    });

    expect(result).toEqual({ error: null });
    expect(insertMock).toHaveBeenCalledWith({
      project_id: projectId,
      planning_block_id: blockId,
      target_type: "entity",
      target_id: entityId,
      link_kind: "MEMORY_LINKED",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("treats an existing Codex entity link as an idempotent success", async () => {
    const entityId = "66666666-6666-4666-8666-666666666666";
    const insertMock = vi.fn();
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "CHARACTER_PLAN" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: entityId },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "existing-link" },
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: insertMock,
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToEntity({
      projectId,
      planningBlockId: blockId,
      entityId,
    });

    expect(result).toEqual({ error: null });
    expect(insertMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("treats concurrent duplicate Codex entity link inserts as success", async () => {
    const entityId = "66666666-6666-4666-8666-666666666666";
    const insertMock = vi.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "CHARACTER_PLAN" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: entityId },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: insertMock,
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToEntity({
      projectId,
      planningBlockId: blockId,
      entityId,
    });

    expect(result).toEqual({ error: null });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });

  it("rejects Codex entity links when the planning card is missing", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToEntity({
      projectId,
      planningBlockId: blockId,
      entityId: "66666666-6666-4666-8666-666666666666",
    });

    expect(result).toEqual({ error: "구상 카드를 찾을 수 없습니다" });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects Codex entity links when the entity is outside the project", async () => {
    const entityId = "66666666-6666-4666-8666-666666666666";
    const insertMock = vi.fn();
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: blockId, kind: "CHARACTER_PLAN" },
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          insert: insertMock,
        }),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToEntity({
      projectId,
      planningBlockId: blockId,
      entityId,
    });

    expect(result).toEqual({ error: "연결할 작품 기억을 찾을 수 없습니다" });
    expect(insertMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects Codex entity links to root planning blocks", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: blockId, kind: "ROOT" },
                error: null,
              }),
            })),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { linkPlanningBlockToEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await linkPlanningBlockToEntity({
      projectId,
      planningBlockId: blockId,
      entityId: "66666666-6666-4666-8666-666666666666",
    });

    expect(result).toEqual({
      error: "기본 4블록에는 작품 기억을 직접 연결하지 않습니다",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("unlinks a Codex entity reference from a planning card", async () => {
    const entityId = "66666666-6666-4666-8666-666666666666";
    const finalEqMock = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: finalEqMock,
                })),
              })),
            })),
          })),
        })),
      })),
    };
    createClientMock.mockResolvedValue(client);

    const { unlinkPlanningBlockFromEntity } = await import(
      "@/app/(dashboard)/projects/[id]/planning-actions"
    );

    const result = await unlinkPlanningBlockFromEntity({
      projectId,
      planningBlockId: blockId,
      entityId,
    });

    expect(result).toEqual({ error: null });
    expect(finalEqMock).toHaveBeenCalledWith("link_kind", "MEMORY_LINKED");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/projects/${projectId}/planning`);
  });
});
