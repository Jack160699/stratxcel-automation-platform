import { Card } from "@/components/ui/Card";

export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading reports">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 rounded-sx-sm bg-sx-surface-2" />
          <div className="mt-1 h-4 w-80 rounded-sx-sm bg-sx-surface-2" />
        </div>
        <div className="h-9 w-36 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <section className="flex flex-col gap-3">
        <div className="h-5 w-44 rounded-sx-sm bg-sx-surface-2" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-3">
              <div className="h-3 w-20 rounded-sx-sm bg-sx-surface-2" />
              <div className="mt-2 h-6 w-12 rounded-sx-sm bg-sx-surface-2" />
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="h-5 w-52 rounded-sx-sm bg-sx-surface-2" />
        <Card className="p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-sx-border py-2.5 last:border-0">
              <div className="h-4 w-32 rounded-sx-sm bg-sx-surface-2" />
              <div className="h-4 w-48 rounded-sx-sm bg-sx-surface-2" />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
