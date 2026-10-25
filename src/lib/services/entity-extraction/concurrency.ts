/**
 * Run `fn` over `items` with at most `limit` in flight. Results are returned
 * in input order (index-stable), so downstream merge policies that prefer
 * later items keep the same semantics as the previous sequential loops.
 * On the first rejection, stop scheduling items and drain in-flight work
 * before propagating it. Already-started requests cannot be cancelled here.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  });

  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}
