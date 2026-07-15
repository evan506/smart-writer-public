export default function PlanningLoading() {
  return (
    <div className="min-h-screen bg-sw-bg-base text-sw-text-primary">
      <header className="border-b border-sw-border-default bg-sw-bg-surface px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 h-4 w-24 rounded bg-sw-bg-hover" />
            <div className="h-8 w-32 rounded bg-sw-bg-hover" />
            <div className="mt-3 h-4 w-72 max-w-full rounded bg-sw-bg-hover" />
          </div>
          <div className="h-9 w-56 max-w-full rounded-md border border-sw-accent-border bg-sw-accent-bg" />
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-126px)] grid-cols-[minmax(0,1fr)_390px] gap-4 px-4 py-4 sm:px-6 sm:py-5 xl:gap-5 max-xl:grid-cols-1">
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="h-5 w-28 rounded bg-sw-bg-hover" />
              <div className="mt-2 h-3 w-64 max-w-full rounded bg-sw-bg-hover" />
            </div>
            <div className="h-9 w-28 rounded-md border border-sw-border-default bg-sw-bg-elevated" />
          </div>

          <div className="rounded-lg border border-sw-border-default bg-sw-bg-surface/70 p-3 shadow-[0_18px_46px_rgba(61,43,22,0.08)]">
            <div className="flex flex-col gap-3 md:grid md:min-w-[760px] md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="rounded-lg border border-sw-border-default bg-sw-bg-elevated p-3"
                >
                  <div className="h-4 w-24 rounded bg-sw-bg-hover" />
                  <div className="mt-3 grid gap-2">
                    <div className="h-24 rounded-md border border-sw-border-default bg-sw-bg-surface" />
                    <div className="h-24 rounded-md border border-sw-border-default bg-sw-bg-surface" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-sw-border-default bg-sw-bg-surface p-4 shadow-[0_18px_46px_rgba(61,43,22,0.08)]">
          <div className="h-4 w-28 rounded bg-sw-bg-hover" />
          <div className="mt-3 h-7 w-36 rounded bg-sw-bg-hover" />
          <div className="mt-6 grid gap-3">
            <div className="h-10 rounded-md border border-sw-border-default bg-sw-bg-elevated" />
            <div className="h-24 rounded-md border border-sw-border-default bg-sw-bg-elevated" />
            <div className="h-10 rounded-md border border-sw-border-default bg-sw-bg-elevated" />
            <div className="h-36 rounded-md border border-sw-border-default bg-sw-bg-elevated" />
          </div>
        </aside>
      </main>
    </div>
  );
}
