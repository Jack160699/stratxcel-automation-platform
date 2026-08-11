import type { StageState } from "../planning/types.ts";

export function detectCycle(
  stageIds: readonly string[],
  dependencies: Readonly<Record<string, readonly string[]>>,
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const dep of dependencies[node] ?? []) {
      if (dfs(dep)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const id of stageIds) {
    if (dfs(id)) return true;
  }
  return false;
}

export function computeReadyStages(
  stages: ReadonlyArray<{ stageId: string; dependencies: readonly string[]; state: StageState }>,
  completedStageIds: ReadonlySet<string>,
  concurrencyLimit = Infinity,
): string[] {
  const ready = stages
    .filter(
      (s) =>
        !completedStageIds.has(s.stageId) &&
        (s.state === "PENDING" || s.state === "WAITING_DEPENDENCY" || s.state === "READY") &&
        s.dependencies.every((dep) => completedStageIds.has(dep)),
    )
    .map((s) => s.stageId);

  return ready.slice(0, concurrencyLimit);
}

export function markReadyStates<T extends { stageId: string; dependencies: readonly string[]; state: StageState }>(
  stages: readonly T[],
  completedStageIds: ReadonlySet<string>,
): Array<Omit<T, "state"> & { state: StageState }> {
  return stages.map((stage) => {
    if (stage.state !== "PENDING" && stage.state !== "WAITING_DEPENDENCY") return stage;
    const depsMet = stage.dependencies.every((dep) => completedStageIds.has(dep));
    return {
      ...stage,
      state: (depsMet ? "READY" : "WAITING_DEPENDENCY") as StageState,
    };
  });
}
