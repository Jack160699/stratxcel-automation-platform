import { Card } from "@/components/ui/Card";

export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading search and discovery">
      <div>
        <div className="h-7 w-56 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-1 h-4 w-96 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <Card className="p-4">
        <div className="h-4 w-36 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-3 h-10 w-full rounded-sx-sm bg-sx-surface-2" />
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 shrink-0 rounded-sx-sm bg-sx-surface-2" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-3">
            <div className="h-3 w-20 rounded-sx-sm bg-sx-surface-2" />
            <div className="mt-2 h-6 w-14 rounded-sx-sm bg-sx-surface-2" />
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded-sx-sm bg-sx-surface-2" />
              <div className="h-5 w-20 rounded-sx-sm bg-sx-surface-2" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
