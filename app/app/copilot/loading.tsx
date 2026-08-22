import { Card } from "@/components/ui/Card";

export default function CopilotLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5 pb-20 md:pb-8 animate-pulse" aria-busy="true" aria-label="Loading Copilot">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-sx-border/80 pb-4">
        <div>
          <div className="h-8 w-36 rounded-sx-sm bg-sx-surface-2" />
          <div className="mt-1 h-4 w-72 rounded-sx-sm bg-sx-surface-2" />
        </div>
        <div className="h-8 w-28 rounded-full bg-sx-surface-2" />
      </div>

      <div className="grid grid-cols-3 xl:hidden rounded-sx-md border border-sx-border bg-sx-surface-1 p-1">
        <div className="h-10 rounded-sx-sm bg-sx-surface-2" />
        <div className="h-10 rounded-sx-sm bg-sx-surface-2" />
        <div className="h-10 rounded-sx-sm bg-sx-surface-2" />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="h-4 w-44 rounded-sx-sm bg-sx-surface-2" />
        <div className="mt-3 h-20 w-full rounded-sx-md bg-sx-surface-2" />
        <div className="mt-3 flex justify-between">
          <div className="h-4 w-32 rounded-sx-sm bg-sx-surface-2" />
          <div className="h-10 w-28 rounded-sx-md bg-sx-surface-2" />
        </div>
      </Card>
    </div>
  );
}
