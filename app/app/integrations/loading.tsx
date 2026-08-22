export default function IntegrationsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] animate-pulse flex-col gap-6 p-4 pb-20 md:pb-8">
      <div>
        <div className="h-6 w-44 rounded bg-sx-surface-2" />
        <div className="mt-2 h-4 w-72 rounded bg-sx-surface-2" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-sx-sm bg-sx-surface-2" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 rounded bg-sx-surface-2" />
                <div className="h-3 w-20 rounded bg-sx-surface-2" />
              </div>
            </div>
            <div className="h-8 w-16 rounded-sx-sm bg-sx-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
