import { Card } from "@/components/ui/Card";

export default function ContentLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading content and media">
      <div>
        <div className="h-7 w-40 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-1 h-4 w-80 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-3">
            <div className="h-3 w-24 rounded-sx-sm bg-sx-surface-2" />
            <div className="mt-2 h-5 w-12 rounded-sx-sm bg-sx-surface-2" />
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-4 w-28 rounded-sx-sm bg-sx-surface-2" />
            <div className="mt-2 h-3 w-44 rounded-sx-sm bg-sx-surface-2" />
          </Card>
        ))}
      </div>
    </div>
  );
}
