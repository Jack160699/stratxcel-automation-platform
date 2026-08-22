export default function SettingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] animate-pulse flex-col gap-6 p-4 pb-20 md:pb-8">
      <div>
        <div className="h-6 w-32 rounded bg-sx-surface-2" />
        <div className="mt-2 h-4 w-56 rounded bg-sx-surface-2" />
      </div>

      <div className="space-y-4 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
        <div className="h-4 w-28 rounded bg-sx-surface-2" />
        <div className="h-10 w-full rounded bg-sx-surface-2/60" />
        <div className="h-4 w-28 rounded bg-sx-surface-2" />
        <div className="h-10 w-full rounded bg-sx-surface-2/60" />
      </div>
    </div>
  );
}
