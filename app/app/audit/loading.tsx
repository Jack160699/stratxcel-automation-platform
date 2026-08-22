export default function AuditLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] animate-pulse flex-col gap-6 px-4 py-6 pb-20 md:pb-8">
      {/* Header Skeleton */}
      <div className="flex flex-col items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 text-center">
        <div className="h-3 w-32 rounded bg-sx-surface-2" />
        <div className="my-3 h-32 w-32 rounded-full border-4 border-sx-surface-2" />
        <div className="h-6 w-28 rounded-full bg-sx-surface-2" />
        <div className="h-4 w-64 rounded bg-sx-surface-2" />
        <div className="mt-2 h-11 w-full max-w-sm rounded-sx-sm bg-sx-surface-2" />
      </div>

      {/* Verified Status Card Skeleton */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
        <div className="h-4 w-44 rounded bg-sx-surface-2" />
        <div className="mt-4 flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="h-2.5 w-2.5 rounded-full bg-sx-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 rounded bg-sx-surface-2" />
                <div className="h-3 w-48 rounded bg-sx-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Opportunities Skeleton */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
        <div className="h-4 w-40 rounded bg-sx-surface-2" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-sx-sm bg-sx-surface-2/40 p-3">
              <div className="h-8 w-8 rounded-sx-sm bg-sx-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 rounded bg-sx-surface-2" />
                <div className="h-3 w-60 rounded bg-sx-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
