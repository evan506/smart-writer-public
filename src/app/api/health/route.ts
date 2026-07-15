import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

type CheckResult = {
  success: boolean;
  error?: string;
};

export async function GET() {
  const verbose =
    process.env.NODE_ENV !== "production" ||
    process.env.HEALTHCHECK_VERBOSE === "1";

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .limit(1);

  const database: CheckResult = {
    success: !error,
    error: error?.message,
  };
  const status = database.success ? "healthy" : "degraded";

  return NextResponse.json(
    verbose
      ? {
          status,
          timestamp: new Date().toISOString(),
          checks: {
            database,
          },
        }
      : {
          status,
          timestamp: new Date().toISOString(),
        },
    { status: database.success ? 200 : 503 }
  );
}
