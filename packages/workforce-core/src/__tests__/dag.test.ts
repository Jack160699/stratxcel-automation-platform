// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/dag.test.ts
import assert from "node:assert/strict";
import { computeReadyStages, detectCycle, markReadyStates } from "../execution/dag.ts";

function run() {
  const dependencies = {
    s_research_audience: [],
    s_research_competitor: [],
    s_strategy: ["s_research_audience", "s_research_competitor"],
    s_content: ["s_strategy"],
  };

  assert.equal(
    detectCycle(Object.keys(dependencies), dependencies),
    false,
  );

  assert.equal(
    detectCycle(["a", "b"], { a: ["b"], b: ["a"] }),
    true,
  );

  const stages = [
    { stageId: "s_research_audience", dependencies: [], state: "PENDING" as const },
    { stageId: "s_research_competitor", dependencies: [], state: "PENDING" as const },
    { stageId: "s_strategy", dependencies: ["s_research_audience", "s_research_competitor"], state: "PENDING" as const },
  ];

  const readyInitial = computeReadyStages(stages, new Set(), 2);
  assert.deepEqual(new Set(readyInitial), new Set(["s_research_audience", "s_research_competitor"]));

  const afterResearch = computeReadyStages(
    markReadyStates(stages, new Set(["s_research_audience", "s_research_competitor"])),
    new Set(["s_research_audience", "s_research_competitor"]),
    1,
  );
  assert.deepEqual(afterResearch, ["s_strategy"]);

  const marked = markReadyStates(stages, new Set());
  assert.equal(marked.filter((s) => s.state === "READY").length, 2);
  assert.equal(marked.find((s) => s.stageId === "s_strategy")?.state, "WAITING_DEPENDENCY");

  console.log("dag.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
