export default function AppLoading() {
  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] animate-pulse flex-col gap-6 pb-20 md:pb-8">
      {/* Header / Health Row Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 text-center">
          <div className="h-3 w-24 rounded bg-sx-surface-2" />
          <div className="my-2 h-28 w-28 rounded-full border-4 border-sx-surface-2" />
          <div className="h-5 w-20 rounded-full bg-sx-surface-2" />
          <div className="h-4 w-48 rounded bg-sx-surface-2" />
          <div className="mt-1 h-11 w-full rounded-sx-sm bg-sx-surface-2" />
        </div>
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <div className="h-3 w-36 rounded bg-sx-surface-2" />
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-sx-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 rounded bg-sx-surface-2" />
                <div className="h-3 w-40 rounded bg-sx-surface-2" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-sx-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 rounded bg-sx-surface-2" />
                <div className="h-3 w-48 rounded bg-sx-surface-2" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-sx-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-24 rounded bg-sx-surface-2" />
                <div className="h-3 w-36 rounded bg-sx-surface-2" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Priorities Section Skeleton */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
        <div className="h-4 w-36 rounded bg-sx-surface-2" />
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 py-2">
            <div className="h-10 w-10 shrink-0 rounded-sx-sm bg-sx-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 rounded bg-sx-surface-2" />
              <div className="h-3 w-64 rounded bg-sx-surface-2" />
            </div>
          </div>
          <div className="flex items-center gap-3 py-2 border-t border-sx-border">
            <div className="h-10 w-10 shrink-0 rounded-sx-sm bg-sx-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-52 rounded bg-sx-surface-2" />
              <div className="h-3 w-72 rounded bg-sx-surface-2" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Tools Grid Skeleton */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-1 p-3">
            <div className="h-9 w-9 rounded-sx-sm bg-sx-surface-2" />
            <div className="h-3 w-16 rounded bg-sx-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
