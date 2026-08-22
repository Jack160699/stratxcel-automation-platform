export default function CopilotLoading() {
  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full max-w-4xl animate-pulse flex-col justify-between p-4">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b border-sx-border pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-sx-surface-2" />
          <div className="space-y-1.5">
            <div className="h-4 w-36 rounded bg-sx-surface-2" />
            <div className="h-3 w-24 rounded bg-sx-surface-2" />
          </div>
        </div>
        <div className="h-8 w-20 rounded-sx-sm bg-sx-surface-2" />
      </div>

      {/* Chat Messages Skeleton */}
      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-sx-surface-2" />
          <div className="max-w-md space-y-2 rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
            <div className="h-4 w-48 rounded bg-sx-surface-2" />
            <div className="h-3 w-64 rounded bg-sx-surface-2" />
          </div>
        </div>
        <div className="flex items-start justify-end gap-3">
          <div className="max-w-md space-y-2 rounded-sx-md bg-sx-accent/20 p-4">
            <div className="h-4 w-40 rounded bg-sx-accent/30" />
          </div>
        </div>
      </div>

      {/* Composer Input Skeleton */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
        <div className="h-12 w-full rounded bg-sx-surface-2/60" />
      </div>
    </div>
  );
}
