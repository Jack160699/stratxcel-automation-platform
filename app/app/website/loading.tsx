export default function WebsiteLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] animate-pulse flex-col gap-6 p-4 pb-20 md:pb-8">
      <div>
        <div className="h-6 w-40 rounded bg-sx-surface-2" />
        <div className="mt-2 h-4 w-64 rounded bg-sx-surface-2" />
      </div>

      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-sx-surface-2" />
        <div className="mx-auto mt-4 h-5 w-48 rounded bg-sx-surface-2" />
        <div className="mx-auto mt-2 h-4 w-72 rounded bg-sx-surface-2" />
        <div className="mx-auto mt-6 h-11 w-44 rounded-sx-sm bg-sx-surface-2" />
      </div>
    </div>
  );
}
