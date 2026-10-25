import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLLMBudget, createLLMBudgetGuard, getLLMBudgetLimits,
  LLMBudgetError, getLLMBudgetMessage, readLLMUsageTotals, evaluateLLMBudget,
  type LLMBudgetLimits, type LLMUsageTotals
} from "@/lib/services/llm-budget.service";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-06-15T12:00:00.000Z");
const empty = {
  authorized: true, project_day_usd: 0, project_month_usd: 0,
  user_day_usd: 0, user_month_usd: 0,
  project_unknown_cost_count: 0, user_unknown_cost_count: 0,
};
const limits: LLMBudgetLimits = {
  dailyUsd: 10, monthlyUsd: 50, userDailyUsd: 20, userMonthlyUsd: 100,
};
function makeClient(overrides: Partial<typeof empty> = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: [{ ...empty, ...overrides }], error: null });
  return { rpc };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("getLLMBudgetLimits", () => {
  const ORIGINAL_DAILY = process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD;
  const ORIGINAL_MONTHLY = process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD;
  const ORIGINAL_USER_DAILY = process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD;
  const ORIGINAL_USER_MONTHLY =
    process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD;

  afterEach(() => {
    if (ORIGINAL_DAILY === undefined) {
      delete process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = ORIGINAL_DAILY;
    }
    if (ORIGINAL_MONTHLY === undefined) {
      delete process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD = ORIGINAL_MONTHLY;
    }
    if (ORIGINAL_USER_DAILY === undefined) {
      delete process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD = ORIGINAL_USER_DAILY;
    }
    if (ORIGINAL_USER_MONTHLY === undefined) {
      delete process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD;
    } else {
      process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD = ORIGINAL_USER_MONTHLY;
    }
  });

  it("returns null for all four limits when env vars are unset", () => {
    delete process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD;
    delete process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD;
    delete process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD;
    delete process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD;

    expect(getLLMBudgetLimits()).toEqual({
      dailyUsd: null,
      monthlyUsd: null,
      userDailyUsd: null,
      userMonthlyUsd: null,
    });
  });

  it("parses valid positive numbers for all four limits", () => {
    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "5";
    process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD = "100.5";
    process.env.SMART_WRITER_LLM_USER_DAILY_BUDGET_USD = "2.5";
    process.env.SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD = "40";

    expect(getLLMBudgetLimits()).toEqual({
      dailyUsd: 5,
      monthlyUsd: 100.5,
      userDailyUsd: 2.5,
      userMonthlyUsd: 40,
    });
  });

  it("treats invalid (non-numeric), zero, and negative values as null", () => {
    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "not-a-number";
    expect(getLLMBudgetLimits().dailyUsd).toBeNull();

    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "0";
    expect(getLLMBudgetLimits().dailyUsd).toBeNull();

    process.env.SMART_WRITER_LLM_DAILY_BUDGET_USD = "-5";
    expect(getLLMBudgetLimits().dailyUsd).toBeNull();
  });
});

describe("single-snapshot budget aggregate", () => {
  it("does not query when all limits are disabled", async () => {
    const client = makeClient();
    expect(await checkLLMBudget(client as never, projectId,
      { dailyUsd: null, monthlyUsd: null }, now))
      .toEqual({ allowed: true, reason: null, warning: null });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("uses one RPC for all configured axes and a fixed UTC timestamp", async () => {
    const client = makeClient();
    expect((await checkLLMBudget(client as never, {projectId,userId}, limits, now)).allowed).toBe(true);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("get_llm_usage_totals", {
      p_project_id: projectId, p_user_id: userId,
      p_project_active: true, p_project_monthly: true,
      p_user_active: true, p_user_monthly: true,
      p_as_of: "2026-06-15T12:00:00.000Z",
    });
  });

  it("does not scan the user axis when user limits are disabled", async () => {
    const client = makeClient();
    await checkLLMBudget(client as never, {projectId,userId}, {dailyUsd:1,monthlyUsd:null}, now);
    expect(client.rpc.mock.calls[0][1]).toMatchObject({p_user_active:false,p_user_monthly:false,p_project_monthly:false});
  });

  it("does not scan the project axis when only user limits are configured", async () => {
    const client = makeClient();
    await checkLLMBudget(client as never, {projectId,userId},
      {dailyUsd:null,monthlyUsd:null,userDailyUsd:1}, now);
    expect(client.rpc.mock.calls[0][1]).toMatchObject({p_project_active:false,p_user_active:true});
  });

  it.each([
    ["monthly", {project_month_usd:50}], ["daily", {project_day_usd:10}],
    ["user_monthly", {user_month_usd:100}], ["user_daily", {user_day_usd:20}],
  ])("blocks at the exact %s limit", async (reason, totals) => {
    const client = makeClient(totals);
    expect(await checkLLMBudget(client as never, {projectId,userId}, limits, now))
      .toEqual({allowed:false,reason,warning:null});
  });

  it("preserves project-before-user and monthly-before-daily precedence", async () => {
    const client = makeClient({project_day_usd:10,project_month_usd:50,user_month_usd:100});
    expect((await checkLLMBudget(client as never,{projectId,userId},limits,now)).reason).toBe("monthly");
  });

  it("accepts aggregate totals beyond the old row scan limit", async () => {
    const client = makeClient({project_month_usd:15000});
    expect((await checkLLMBudget(client as never,projectId,{dailyUsd:null,monthlyUsd:14000},now)).reason).toBe("monthly");
  });

  it.each([undefined,null,""])("stops when configured user limits have no user ID: %s", async (missing) => {
    const client = makeClient();
    expect((await checkLLMBudget(client as never,{projectId,userId:missing},limits,now)).reason).toBe("unavailable");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("stops AI on RPC errors including missing migration", async () => {
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const client = makeClient();
    client.rpc.mockResolvedValue({data:null,error:{message:"function not found"}});
    expect(await checkLLMBudget(client as never,{projectId,userId},limits,now))
      .toEqual({allowed:false,reason:"unavailable",warning:null});
  });

  it("converts transport rejection into unavailable without throwing", async () => {
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const client = makeClient(); client.rpc.mockRejectedValue(new Error("network"));
    expect((await checkLLMBudget(client as never,{projectId,userId},limits,now)).reason).toBe("unavailable");
  });

  it.each([
    {authorized:false}, {project_day_usd:-1}, {user_month_usd:NaN},
    {project_month_usd:Infinity}, {project_unknown_cost_count:-1},
  ])("rejects untrusted or malformed totals %j", async (totals) => {
    expect((await checkLLMBudget(makeClient(totals) as never,{projectId,userId},limits,now)).reason).toBe("unavailable");
  });

  it.each([null,[],[empty,empty],[{...empty,project_day_usd:null}],
    [{...empty,project_day_usd:"1"}]])("rejects missing or nonnumeric aggregate %j", async (data) => {
    const client = makeClient();client.rpc.mockResolvedValue({data,error:null});
    expect((await checkLLMBudget(client as never,{projectId,userId},limits,now)).reason).toBe("unavailable");
  });

  it("rejects invalid timestamps", async()=>{
    const client=makeClient();
    expect((await checkLLMBudget(client as never,{projectId,userId},limits,new Date(NaN))).reason).toBe("unavailable");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("reports missing pricing separately without inventing a price", async () => {
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const client=makeClient({project_unknown_cost_count:1});
    expect((await checkLLMBudget(client as never,{projectId,userId},limits,now)).allowed).toBe(true);
    expect(warn).toHaveBeenCalledWith("[LLMBudget] usage has unknown costs:",expect.objectContaining({project:1}));
  });

  it.each([50,80])("reports the %s percent warning tier", async(level)=>{
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    const client=makeClient({project_day_usd:level/10});
    expect((await checkLLMBudget(client as never,{projectId,userId},limits,now)).warning)
      .toMatchObject({level,axis:"project",window:"daily"});
  });

  it("chooses highest warning tier across axes",async()=>{
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    const result=await checkLLMBudget(makeClient({project_day_usd:6,user_month_usd:85}) as never,{projectId,userId},limits,now);
    expect(result.warning).toMatchObject({level:80,axis:"user",window:"monthly"});
  });

  it("guard prevents unattributed paid calls even when budgets are disabled",async()=>{
    const client=makeClient();
    await expect(createLLMBudgetGuard(client as never,{projectId})()).rejects.toBeInstanceOf(LLMBudgetError);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("guard converts an exceeded budget into a typed error",async()=>{
    vi.stubEnv("SMART_WRITER_LLM_DAILY_BUDGET_USD","1");
    const check=createLLMBudgetGuard(makeClient({project_day_usd:2}) as never,{projectId,userId});
    await expect(check()).rejects.toMatchObject({reason:"daily"});
  });

  it("gives distinct unavailable and over-budget messages",()=>{
    expect(getLLMBudgetMessage({reason:"unavailable"})).toContain("확인할 수 없어");
    expect(getLLMBudgetMessage({reason:"daily"})).toContain("도달했습니다");
  });
});


describe("shared usage reader and budget evaluator", () => {
  const full = { projectActive: true, projectMonthly: true, userActive: true, userMonthly: true };

  it("reads all display axes even when no budget is configured", async () => {
    const client = makeClient({ project_month_usd: 7, user_month_usd: 9 });
    const totals = await readLLMUsageTotals(client as never, { projectId, userId }, full, now);
    expect(totals).toMatchObject({ project_month_usd: 7, user_month_usd: 9 });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("get_llm_usage_totals", {
      p_project_id: projectId, p_user_id: userId,
      p_project_active: true, p_project_monthly: true,
      p_user_active: true, p_user_monthly: true, p_as_of: now.toISOString(),
    });
    expect(evaluateLLMBudget(totals, { dailyUsd: null, monthlyUsd: null }))
      .toEqual({ allowed: true, reason: null, warning: null });
  });

  it("allows disabled budgets despite an unavailable aggregate", () => {
    expect(evaluateLLMBudget(null, { dailyUsd: null, monthlyUsd: null }))
      .toEqual({ allowed: true, reason: null, warning: null });
    expect(evaluateLLMBudget(null, limits))
      .toEqual({ allowed: false, reason: "unavailable", warning: null });
  });

  it.each([
    { authorized: false }, { project_day_usd: -1 }, { user_month_usd: NaN },
    { project_unknown_cost_count: Infinity },
  ])("fails closed for invalid aggregate %j", (overrides) => {
    expect(evaluateLLMBudget({ ...empty, ...overrides }, limits).reason).toBe("unavailable");
  });

  it.each([
    { dailyUsd: null, monthlyUsd: null },
    { dailyUsd: 10, monthlyUsd: null },
    { dailyUsd: null, monthlyUsd: 50 },
    { dailyUsd: null, monthlyUsd: null, userDailyUsd: 20 },
    { dailyUsd: null, monthlyUsd: null, userMonthlyUsd: 100 },
    limits,
  ] satisfies LLMBudgetLimits[])("matches the paid guard for limits %j", async (configured) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const amount of [0, 0.5, 0.8, 1, 1.2]) {
      const totals: LLMUsageTotals = {
        ...empty, project_day_usd: amount * 10, project_month_usd: amount * 50,
        user_day_usd: amount * 20, user_month_usd: amount * 100,
      };
      expect(evaluateLLMBudget(totals, configured)).toEqual(
        await checkLLMBudget(makeClient(totals) as never, { projectId, userId }, configured, now)
      );
    }
  });

  it("does not change a daily-only decision when the display includes older unknown costs", () => {
    const configured = { dailyUsd: 10, monthlyUsd: null };
    const display = { ...empty, project_day_usd: 6, project_month_usd: 100,
      project_unknown_cost_count: 9, user_unknown_cost_count: 3 };
    const guard = { ...empty, project_day_usd: 6 };
    expect(evaluateLLMBudget(display, configured)).toEqual(evaluateLLMBudget(guard, configured));
    expect(evaluateLLMBudget(display, configured).allowed).toBe(true);
  });

  it("does not query on invalid time or missing user for a requested user axis", async () => {
    const client = makeClient();
    expect(await readLLMUsageTotals(client as never, { projectId, userId }, full, new Date(NaN))).toBeNull();
    expect(await readLLMUsageTotals(client as never, { projectId }, full, now)).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("keeps the pure evaluator free of logging", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    evaluateLLMBudget({ ...empty, project_day_usd: 8, project_unknown_cost_count: 3 }, limits);
    expect(warn).not.toHaveBeenCalled();
  });
});
