import { Card } from "@/components/ui/Card";

export default function MissionsLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading missions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="h-7 w-32 rounded-sx-sm bg-sx-surface-2" />
          <div className="mt-1 h-4 w-72 rounded-sx-sm bg-sx-surface-2" />
        </div>
      </div>

      <Card className="p-4">
        <div className="h-4 w-36 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="h-10 flex-1 rounded-sx-sm bg-sx-surface-2" />
          <div className="h-10 w-28 rounded-sx-sm bg-sx-surface-2" />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="p-4">
          <div className="h-4 w-40 rounded-sx-sm bg-sx-surface-2" />
        </div>
        <div className="border-t border-sx-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-sx-border px-4 py-3 last:border-0">
              <div className="h-4 w-60 rounded-sx-sm bg-sx-surface-2" />
              <div className="h-5 w-20 rounded-sx-sm bg-sx-surface-2" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
