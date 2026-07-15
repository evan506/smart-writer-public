/**
 * Shared chainable Supabase client mock helper.
 *
 * For NEW tests. Existing tests keep their local mocks until touched.
 *
 * `createSupabaseMock(handlers)` builds a fake Supabase client whose
 * `.from(table)` returns a chainable query builder supporting
 * select/insert/update/delete/upsert plus eq/in/neq/gte/lt/order/limit filters,
 * and resolves via `.maybeSingle()`, `.single()`, or by awaiting the chain
 * directly (like the real supabase-js query builder, which is thenable).
 *
 * `handlers` maps a table name to either:
 *  - an array of responses: dequeued once per `.from(table)` call, in order
 *    (use this when the same table is queried multiple times with different
 *    expected results — "per-operation" responses).
 *  - a single response object: reused for every `.from(table)` call on that
 *    table (a constant response).
 *
 * Every `.from(table)` call (and its resolved chain) is recorded in `calls`
 * so tests can assert on table, operation (select/insert/update/delete/
 * upsert), payload (the value passed to insert/update/upsert), and filters
 * (the ordered list of eq/in/neq/gte/order/limit calls).
 *
 * Example:
 *   const { client, calls } = createSupabaseMock({
 *     entities: [{ data: [{ id: "e1" }], error: null }],
 *   });
 *   const { data } = await client.from("entities").select("*").eq("project_id", "p1");
 *   expect(calls[0]).toMatchObject({ table: "entities", operation: "select" });
 */

export type SupabaseMockResult<T = unknown> = {
  data?: T | null;
  error?: { message: string; code?: string } | null;
};

export type SupabaseMockHandlers = Record<
  string,
  SupabaseMockResult | SupabaseMockResult[]
>;

export type SupabaseMockOperation =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "upsert";

export interface SupabaseMockFilter {
  method: string;
  args: unknown[];
}

export interface SupabaseMockCall {
  table: string;
  operation: SupabaseMockOperation;
  payload?: unknown;
  filters: SupabaseMockFilter[];
}

export interface SupabaseMock {
  /** Fake client — pass this wherever a Supabase server client is expected. */
  client: {
    from: (table: string) => unknown;
    rpc: (...args: unknown[]) => Promise<SupabaseMockResult>;
  };
  /** One entry per resolved query (terminal call or awaited chain), in order. */
  calls: SupabaseMockCall[];
  /** Every `.from(table)` invocation, in call order (raw table names). */
  fromCalls: string[];
}

type HandlerEntry =
  | { kind: "queue"; queue: SupabaseMockResult[] }
  | { kind: "constant"; value: SupabaseMockResult };

export function createSupabaseMock(
  handlers: SupabaseMockHandlers = {}
): SupabaseMock {
  const calls: SupabaseMockCall[] = [];
  const fromCalls: string[] = [];
  const entries = new Map<string, HandlerEntry>();

  for (const [table, value] of Object.entries(handlers)) {
    entries.set(
      table,
      Array.isArray(value)
        ? { kind: "queue", queue: [...value] }
        : { kind: "constant", value }
    );
  }

  function nextResult(table: string): SupabaseMockResult {
    const entry = entries.get(table);
    if (!entry) return { data: null, error: null };
    if (entry.kind === "constant") return entry.value;
    return entry.queue.shift() ?? { data: null, error: null };
  }

  function makeChain(table: string) {
    const record: SupabaseMockCall = {
      table,
      operation: "select",
      filters: [],
    };
    const promise = Promise.resolve(nextResult(table));
    let recorded = false;

    function recordOnce() {
      if (recorded) return;
      recorded = true;
      calls.push({ ...record, filters: [...record.filters] });
    }

    const addFilter = (method: string) =>
      (...args: unknown[]) => {
        record.filters.push({ method, args });
        return chain;
      };

    const chain: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        if (args.length > 0) record.filters.push({ method: "select", args });
        return chain;
      },
      insert: (payload: unknown) => {
        record.operation = "insert";
        record.payload = payload;
        return chain;
      },
      update: (payload: unknown) => {
        record.operation = "update";
        record.payload = payload;
        return chain;
      },
      upsert: (payload: unknown, options?: unknown) => {
        record.operation = "upsert";
        record.payload = payload;
        if (options !== undefined) {
          record.filters.push({ method: "upsertOptions", args: [options] });
        }
        return chain;
      },
      delete: () => {
        record.operation = "delete";
        return chain;
      },
      eq: addFilter("eq"),
      neq: addFilter("neq"),
      in: addFilter("in"),
      gte: addFilter("gte"),
      lt: addFilter("lt"),
      order: addFilter("order"),
      limit: addFilter("limit"),
      maybeSingle: () => {
        recordOnce();
        return promise;
      },
      single: () => {
        recordOnce();
        return promise;
      },
      then: (
        onfulfilled?: ((value: SupabaseMockResult) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ) => {
        recordOnce();
        return promise.then(onfulfilled, onrejected);
      },
    };
    return chain;
  }

  const client = {
    from(table: string) {
      fromCalls.push(table);
      return makeChain(table);
    },
    rpc(...args: unknown[]) {
      const table = typeof args[0] === "string" ? args[0] : "rpc";
      calls.push({ table: "rpc", operation: "select", payload: args, filters: [] });
      return Promise.resolve(nextResult(table));
    },
  };

  return { client, calls, fromCalls };
}
