import { Card } from "@/components/ui/Card";

export default function ApprovalsLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading approvals">
      <div>
        <div className="h-7 w-36 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-1 h-4 w-72 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between">
              <div className="h-5 w-48 rounded-sx-sm bg-sx-surface-2" />
              <div className="h-8 w-24 rounded-sx-sm bg-sx-surface-2" />
            </div>
            <div className="mt-2 h-4 w-32 rounded-sx-sm bg-sx-surface-2" />
          </Card>
        ))}
      </div>
    </div>
  );
}
