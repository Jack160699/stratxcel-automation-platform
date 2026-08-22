import { Card } from "@/components/ui/Card";

export default function FilesLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading files">
      <div>
        <div className="h-7 w-32 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-1 h-4 w-72 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 rounded-sx-sm bg-sx-surface-2" />
          <div className="h-5 w-24 rounded-sx-sm bg-sx-surface-2" />
        </div>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="h-10 w-full rounded-sx-sm bg-sx-surface-2 sm:max-w-xs" />
        <div className="flex gap-1.5 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-20 shrink-0 rounded-sx-pill bg-sx-surface-2" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5">
            <div className="h-4 w-48 rounded-sx-sm bg-sx-surface-2" />
            <div className="mt-2 h-3 w-32 rounded-sx-sm bg-sx-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
