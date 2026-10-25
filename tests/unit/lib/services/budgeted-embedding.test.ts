import { afterEach, describe, expect, it, vi } from "vitest";
import { embedText, embedTexts } from "@/lib/services/embedding.service";
import { createBudgetedEmbeddingOptions } from "@/lib/services/budgeted-embedding";
const context={projectId:"project",userId:"user",feature:"embedding" as const};
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("budgeted embedding persistence",()=>{
  it.each(["error","reject"])("stops on logging %s without starting another paid batch",async(mode)=>{
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS","0");
    vi.stubEnv("SMART_WRITER_LLM_DAILY_BUDGET_USD","");
    vi.stubEnv("SMART_WRITER_LLM_MONTHLY_BUDGET_USD","");
    vi.stubEnv("SMART_WRITER_LLM_USER_DAILY_BUDGET_USD","");
    vi.stubEnv("SMART_WRITER_LLM_USER_MONTHLY_BUDGET_USD","");
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const insert=vi.fn();
    if(mode==="error") insert.mockResolvedValue({error:{message:"unavailable"}});
    else insert.mockRejectedValue(new Error("network"));
    const supabase={from:vi.fn(()=>({insert}))};
    const create=vi.fn(async({input}:{input:string|string[]})=>({
      data:(input as string[]).map((_,index)=>({index,embedding:[1]})),usage:{cost:0.01},
    }));
    await expect(embedTexts(Array.from({length:100},()=>"text"),{
      ...createBudgetedEmbeddingOptions(supabase as never,context),client:{create},
    })).rejects.toMatchObject({reason:"unavailable"});
    expect(create).toHaveBeenCalledTimes(1);expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({user_id:"user",cost_usd:0.01});
  });
  it("rejects unattributed usage before a paid request with no limits configured",async()=>{
    vi.stubEnv("SMART_WRITER_SKIP_EMBEDDINGS","0");
    const create=vi.fn();
    await expect(embedText("text",{...createBudgetedEmbeddingOptions({} as never,{...context,userId:null}),client:{create}}))
      .rejects.toMatchObject({reason:"unavailable"});
    expect(create).not.toHaveBeenCalled();
  });
});
