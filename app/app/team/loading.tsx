import { Card } from "@/components/ui/Card";

export default function TeamLoading() {
  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8 animate-pulse" aria-busy="true" aria-label="Loading team">
      <div>
        <div className="h-7 w-32 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-1 h-3 w-16 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-1 h-4 w-64 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <div className="h-12 w-full rounded-sx-md bg-sx-surface-2" />

      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-3.5">
            <div className="flex items-center gap-3">
              <div className="h-[42px] w-[42px] shrink-0 rounded-full bg-sx-surface-2" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-44 rounded-sx-sm bg-sx-surface-2" />
                <div className="mt-1.5 h-3 w-28 rounded-sx-sm bg-sx-surface-2" />
              </div>
              <div className="h-6 w-16 rounded-sx-sm bg-sx-surface-2" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
