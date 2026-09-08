import fs from "node:fs";
import path from "node:path";
import { CodeCraftClient } from "../lib/codecraft/client.ts";
import { StratXcelCurrentProviderRunner } from "../lib/codecraft/current-provider-adapter.ts";
import { STRATXCEL_BENCHMARK_WORKLOADS } from "../lib/codecraft/workloads.ts";
import type {
  BenchmarkSummary,
  ExecutionRecord,
} from "../lib/codecraft/types.ts";

async function runBenchmark() {
  console.log("==================================================================");
  console.log("STRATXCEL — CODECRAFT API BENCHMARK & COMPARISON SUITE");
  console.log("==================================================================");

  const client = new CodeCraftClient({ timeoutMs: 60000 });
  const currentProviderRunner = new StratXcelCurrentProviderRunner();

  console.log(`- CodeCraft Base URL: ${client.baseUrl}`);
  console.log(`- CodeCraft Key Status: ${client.isConfigured() ? "Configured" : "NOT CONFIGURED (missing CODECRAFT_API_KEY)"}`);
  console.log(`- Safety Token Limit: ${client.tokenLimit.toLocaleString()} tokens`);
  console.log(`- Current StratXcel Baseline: ${currentProviderRunner.getPrimaryProvider().toUpperCase()}`);
  console.log("------------------------------------------------------------------");

  // Step 1: Probe CodeCraft connectivity
  console.log("\n[1/4] Probing CodeCraft API connection...");
  const probe = await client.probeConnection();
  console.log(`  Connection status code: ${probe.status}`);
  console.log(`  Reachable: ${probe.reachable}`);
  if (probe.error) {
    console.log(`  Notice/Error: ${probe.error}`);
  }
  if (probe.models.length > 0) {
    console.log(`  Discovered ${probe.models.length} available models: ${probe.models.slice(0, 5).join(", ")}${probe.models.length > 5 ? "..." : ""}`);
  } else {
    console.log("  No models list returned (likely unauthenticated or gateway root restricted).");
  }

  // Choose CodeCraft target model
  const codeCraftModel = probe.models.find((m) => m === "deepseek-v4-flash-0731" || m.includes("flash-0731") || m.includes("flash"))
    || probe.models.find((m) => m.includes("deepseek"))
    || probe.models[0]
    || "deepseek-v4-flash-0731";

  console.log(`  Selected CodeCraft target model: ${codeCraftModel}`);

  const codecraftRecords: ExecutionRecord[] = [];
  const stratxcelRecords: ExecutionRecord[] = [];

  // Step 2: Run workloads on CodeCraft
  console.log("\n[2/4] Executing benchmark tasks on CodeCraft API...");
  for (const task of STRATXCEL_BENCHMARK_WORKLOADS) {
    process.stdout.write(`  Running [${task.id}] ${task.title}... `);

    if (task.category === "embeddings") {
      const input = typeof task.messages[0]?.content === "string"
        ? task.messages[0].content
        : "solar energy battery storage";
      const embRes = await client.embeddings(input);
      const record: ExecutionRecord = {
        testId: task.id,
        testTitle: task.title,
        category: task.category,
        provider: "codecraft",
        model: "text-embedding-3-small",
        success: embRes.ok,
        latencyMs: embRes.latencyMs,
        tokens: {
          promptTokens: embRes.usage?.prompt_tokens || 0,
          completionTokens: 0,
          totalTokens: embRes.usage?.total_tokens || 0,
        },
        responseSnippet: embRes.ok
          ? `[Embedding vector dim=${embRes.vectorDimension}]`
          : "",
        error: embRes.error,
      };
      codecraftRecords.push(record);
      console.log(record.success ? `PASS (${record.latencyMs}ms, ${record.tokens.totalTokens} tok)` : `FAIL (${record.error})`);
      continue;
    }

    const completion = await client.chatCompletion({
      model: codeCraftModel,
      messages: task.messages,
      tools: task.tools,
      responseFormat: task.responseFormat,
      temperature: 0.7,
    });

    let jsonValidation: ExecutionRecord["jsonValidation"];
    if (task.category === "structured_json") {
      try {
        JSON.parse(completion.text);
        jsonValidation = { attempted: true, valid: true };
      } catch (err) {
        jsonValidation = { attempted: true, valid: false, error: String(err) };
      }
    }

    let toolCallValidation: ExecutionRecord["toolCallValidation"];
    if (task.category === "tool_calling") {
      const first = completion.toolCalls?.[0];
      toolCallValidation = {
        attempted: true,
        called: Boolean(first),
        toolName: first?.function?.name,
        validArguments: Boolean(first?.function?.arguments),
      };
    }

    const snippet = completion.toolCalls?.[0]
      ? `[Tool Call: ${completion.toolCalls[0].function.name}(${completion.toolCalls[0].function.arguments})]`
      : completion.text.replace(/\s+/g, " ").slice(0, 160);

    const record: ExecutionRecord = {
      testId: task.id,
      testTitle: task.title,
      category: task.category,
      provider: "codecraft",
      model: codeCraftModel,
      success: completion.ok,
      latencyMs: completion.latencyMs,
      tokens: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      },
      responseSnippet: snippet,
      jsonValidation,
      toolCallValidation,
      error: completion.error,
    };

    codecraftRecords.push(record);
    console.log(record.success ? `PASS (${record.latencyMs}ms, ${record.tokens.totalTokens} tok)` : `FAIL (${record.error})`);

    if (client.hasExceededTokenLimit()) {
      console.log(`\n  [SAFETY GUARD] Reached token safety cap of ${client.tokenLimit}. Aborting further tests.`);
      break;
    }
  }

  // Step 3: Run workloads on Current StratXcel Provider Baseline
  console.log("\n[3/4] Executing benchmark tasks on Current StratXcel Provider...");
  for (const task of STRATXCEL_BENCHMARK_WORKLOADS) {
    process.stdout.write(`  Running [${task.id}] ${task.title}... `);
    const record = await currentProviderRunner.runBenchmarkTask(task);
    stratxcelRecords.push(record);
    console.log(record.success ? `PASS (${record.latencyMs}ms, ${record.tokens.totalTokens} tok)` : `FAIL (${record.error})`);
  }

  // Step 4: Generate comparison summary
  console.log("\n[4/4] Computing side-by-side benchmark metrics...");

  const codecraftSuccess = codecraftRecords.filter((r) => r.success);
  const codecraftAvgLatency = codecraftSuccess.length > 0
    ? Math.round(codecraftSuccess.reduce((acc, r) => acc + r.latencyMs, 0) / codecraftSuccess.length)
    : 0;
  const codecraftTokens = codecraftRecords.reduce((acc, r) => acc + r.tokens.totalTokens, 0);

  const stratxcelSuccess = stratxcelRecords.filter((r) => r.success);
  const stratxcelAvgLatency = stratxcelSuccess.length > 0
    ? Math.round(stratxcelSuccess.reduce((acc, r) => acc + r.latencyMs, 0) / stratxcelSuccess.length)
    : 0;
  const stratxcelTokens = stratxcelRecords.reduce((acc, r) => acc + r.tokens.totalTokens, 0);

  const summary: BenchmarkSummary = {
    timestamp: new Date().toISOString(),
    branch: "experiment/codecraft-test",
    codecraftConnection: {
      configured: client.isConfigured(),
      reachable: probe.reachable,
      status: probe.status,
      modelsCount: probe.models.length,
      models: probe.models,
      error: probe.error,
    },
    tokenLimit: client.tokenLimit,
    totalTokensConsumed: client.getCumulativeTokens(),
    limitExceeded: client.hasExceededTokenLimit(),
    records: [...codecraftRecords, ...stratxcelRecords],
    comparison: {
      codecraft: {
        testsRun: codecraftRecords.length,
        successCount: codecraftSuccess.length,
        avgLatencyMs: codecraftAvgLatency,
        totalTokens: codecraftTokens,
        successRate: Math.round((codecraftSuccess.length / Math.max(1, codecraftRecords.length)) * 100),
      },
      stratxcelCurrent: {
        provider: currentProviderRunner.getPrimaryProvider(),
        testsRun: stratxcelRecords.length,
        successCount: stratxcelSuccess.length,
        avgLatencyMs: stratxcelAvgLatency,
        totalTokens: stratxcelTokens,
        successRate: Math.round((stratxcelSuccess.length / Math.max(1, stratxcelRecords.length)) * 100),
      },
    },
  };

  // Output side-by-side table
  console.log("\n==================================================================");
  console.log("BENCHMARK COMPARISON TABLE");
  console.log("==================================================================");
  console.log(
    "| Task ID | Task Category | CodeCraft Success | CC Latency | StratXcel Success | StratXcel Latency |"
  );
  console.log(
    "|---|---|---|---|---|---|"
  );

  for (let i = 0; i < STRATXCEL_BENCHMARK_WORKLOADS.length; i++) {
    const task = STRATXCEL_BENCHMARK_WORKLOADS[i];
    const cc = codecraftRecords[i];
    const sc = stratxcelRecords[i];
    const ccStatus = cc?.success ? "YES" : "NO";
    const ccLat = cc?.success ? `${cc.latencyMs}ms` : (cc?.error ? cc.error.slice(0, 15) : "ERR");
    const scStatus = sc?.success ? "YES" : "NO";
    const scLat = sc?.success ? `${sc.latencyMs}ms` : (sc?.error ? sc.error.slice(0, 15) : "ERR");

    console.log(`| ${task.id} | ${task.category} | ${ccStatus} | ${ccLat} | ${scStatus} | ${scLat} |`);
  }

  console.log("\n==================================================================");
  console.log("OVERALL METRICS SUMMARY");
  console.log("==================================================================");
  console.log(`CodeCraft Connection: ${summary.codecraftConnection.reachable ? "Reachable" : "Unreachable"} (HTTP ${summary.codecraftConnection.status})`);
  console.log(`CodeCraft Success Rate: ${summary.comparison.codecraft.successRate}% (${summary.comparison.codecraft.successCount}/${summary.comparison.codecraft.testsRun})`);
  console.log(`CodeCraft Avg Latency: ${summary.comparison.codecraft.avgLatencyMs}ms`);
  console.log(`CodeCraft Tokens Used: ${summary.comparison.codecraft.totalTokens}`);
  console.log(`StratXcel Baseline Provider: ${summary.comparison.stratxcelCurrent.provider.toUpperCase()}`);
  console.log(`StratXcel Success Rate: ${summary.comparison.stratxcelCurrent.successRate}% (${summary.comparison.stratxcelCurrent.successCount}/${summary.comparison.stratxcelCurrent.testsRun})`);
  console.log(`StratXcel Avg Latency: ${summary.comparison.stratxcelCurrent.avgLatencyMs}ms`);
  console.log(`StratXcel Tokens Used: ${summary.comparison.stratxcelCurrent.totalTokens}`);

  // Write JSON report to scratch directory
  const scratchDir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  const reportPath = path.join(scratchDir, "codecraft-benchmark-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nDetailed benchmark report written to: ${reportPath}`);

  return summary;
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with uncaught exception:", err);
  process.exit(1);
});
