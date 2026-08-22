export default function BillingLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] animate-pulse flex-col gap-6 p-4 pb-20 md:pb-8">
      <div>
        <div className="h-6 w-36 rounded bg-sx-surface-2" />
        <div className="mt-2 h-4 w-52 rounded bg-sx-surface-2" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <div className="h-5 w-24 rounded bg-sx-surface-2" />
          <div className="mt-4 h-8 w-32 rounded bg-sx-surface-2" />
          <div className="mt-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-3 w-full rounded bg-sx-surface-2/60" />
            ))}
          </div>
          <div className="mt-6 h-11 w-full rounded-sx-sm bg-sx-surface-2" />
        </div>
        <div className="rounded-sx-md border border-sx-accent/40 bg-sx-surface-1 p-5">
          <div className="h-5 w-28 rounded bg-sx-accent/30" />
          <div className="mt-4 h-8 w-36 rounded bg-sx-surface-2" />
          <div className="mt-6 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-full rounded bg-sx-surface-2/60" />
            ))}
          </div>
          <div className="mt-6 h-11 w-full rounded-sx-sm bg-sx-accent/40" />
        </div>
      </div>
    </div>
  );
}
