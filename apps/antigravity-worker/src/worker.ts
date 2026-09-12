import fs from "node:fs";
import path from "node:path";
import {
  createPostgresQueueAdapter,
  recordWorkerHeartbeat,
  CODING_TASK_JOB_TYPE,
  type QueueAdapter,
  type QueueJobRow,
  type CodingTaskPayload,
  type CodingTaskExecutionResult,
} from "@stratxcel/queue";
import { createClient } from "@supabase/supabase-js";
import { loadWorkerConfig, type AntigravityWorkerConfig } from "./config.ts";
import { executeCodingTask } from "./executor.ts";

// Auto-load root .env or .env.local if present
try {
  const rootEnv = path.resolve(process.cwd(), ".env");
  const rootEnvLocal = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(rootEnvLocal) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(rootEnvLocal);
  } else if (fs.existsSync(rootEnv) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(rootEnv);
  }
} catch {
  // Ignore env file loading errors
}

export function createWorkerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase credentials missing: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class AntigravityWorkerDaemon {
  private readonly config: AntigravityWorkerConfig;
  private readonly supabase: ReturnType<typeof createWorkerSupabaseClient>;
  private readonly queue: QueueAdapter;
  private running = false;
  private currentJob: QueueJobRow | null = null;
  private status: "idle" | "busy" | "degraded" | "stopped" = "idle";
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private leaseOwner: string;

  constructor(customConfig?: Partial<AntigravityWorkerConfig>) {
    this.config = { ...loadWorkerConfig(), ...customConfig };
    this.supabase = createWorkerSupabaseClient();
    this.queue = createPostgresQueueAdapter(this.supabase as never);
    this.leaseOwner = `${this.config.workerType}-${this.config.workerId}`;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.status = "idle";

    console.log(`[antigravity-worker] Started daemon '${this.config.workerId}' (machine: ${this.config.machineId})`);
    console.log(`[antigravity-worker] Antigravity CLI path: ${this.config.antigravityIdePath}`);
    console.log(`[antigravity-worker] Authorized workspaces:`, Object.keys(this.config.allowedWorkspaces));

    // Initial heartbeat
    await this.sendHeartbeat();

    // Setup periodic process heartbeat
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat().catch((err) => {
        console.warn(`[antigravity-worker] Heartbeat write failed:`, (err as Error).message);
      });
    }, this.config.heartbeatIntervalMs);

    // Setup graceful shutdown hooks
    const shutdown = async () => {
      console.log("\n[antigravity-worker] Shutdown signal received...");
      await this.stop();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    // Main polling loop
    void this.pollLoop();
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.status = "stopped";
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    try {
      await this.sendHeartbeat();
      console.log(`[antigravity-worker] Worker stopped gracefully.`);
    } catch (err) {
      console.warn(`[antigravity-worker] Error during stop heartbeat:`, (err as Error).message);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await recordWorkerHeartbeat(this.supabase as never, {
        workerType: "antigravity-worker",
        instanceId: this.config.workerId,
        status: this.status,
        version: this.config.version,
        queueBacklogHint: 0,
      });
    } catch (err) {
      console.warn(`[antigravity-worker] Failed to record heartbeat:`, (err as Error).message);
    }
  }

  private async pollLoop(): Promise<void> {
    let consecutiveErrors = 0;

    while (this.running) {
      try {
        // Claim next coding task
        const job = await this.queue.claimNext({
          leaseOwner: this.leaseOwner,
          jobTypes: [CODING_TASK_JOB_TYPE],
          leaseSeconds: this.config.leaseSeconds,
        });

        if (job) {
          consecutiveErrors = 0;
          await this.processJob(job);
        } else {
          // No job available, wait poll interval
          consecutiveErrors = 0;
          await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
        }
      } catch (err) {
        consecutiveErrors++;
        const backoffMs = Math.min(30000, this.config.pollIntervalMs * Math.pow(1.5, consecutiveErrors));
        console.warn(
          `[antigravity-worker] Poll error (${consecutiveErrors}): ${(err as Error).message}. Retrying in ${Math.round(backoffMs / 1000)}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  private async processJob(job: QueueJobRow): Promise<void> {
    console.log(`[antigravity-worker] Claimed job ${job.id} (mission: ${job.payload?.missionId ?? "unknown"})`);
    this.currentJob = job;
    this.status = "busy";
    await this.sendHeartbeat();

    // Start lease renewal timer during job execution
    const leaseRenewalInterval = Math.max(5000, Math.floor((this.config.leaseSeconds * 1000) / 3));
    const leaseTimer = setInterval(() => {
      void this.queue.heartbeat({
        jobId: job.id,
        leaseOwner: this.leaseOwner,
        leaseSeconds: this.config.leaseSeconds,
      }).catch((e) => console.warn(`[antigravity-worker] Job lease heartbeat failed:`, (e as Error).message));
    }, leaseRenewalInterval);

    try {
      const payload = job.payload as unknown as CodingTaskPayload;
      const result: CodingTaskExecutionResult = await executeCodingTask(this.config, payload);

      clearInterval(leaseTimer);

      if (result.status === "SUCCEEDED" || result.status === "BLOCKED") {
        console.log(`[antigravity-worker] Job ${job.id} outcome: ${result.status} (${result.summary})`);
        await this.queue.complete({
          jobId: job.id,
          leaseOwner: this.leaseOwner,
        });
      } else {
        console.error(`[antigravity-worker] Job ${job.id} failed:`, result.errors);
        await this.queue.fail({
          jobId: job.id,
          leaseOwner: this.leaseOwner,
          error: {
            message: result.summary || "Task execution failed.",
            code: "EXECUTION_FAILURE",
            retryable: false,
            details: { ...result },
          },
        });
      }
    } catch (err) {
      clearInterval(leaseTimer);
      console.error(`[antigravity-worker] Unexpected error processing job ${job.id}:`, (err as Error).message);
      await this.queue.fail({
        jobId: job.id,
        leaseOwner: this.leaseOwner,
        error: {
          message: (err as Error).message,
          code: "UNEXPECTED_ERROR",
          retryable: false,
        },
      });
    } finally {
      this.currentJob = null;
      this.status = "idle";
      await this.sendHeartbeat();
    }
  }
}

// If invoked directly from CLI, start the daemon
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/worker.ts")) {
  const daemon = new AntigravityWorkerDaemon();
  daemon.start().catch((err) => {
    console.error("[antigravity-worker] Fatal startup error:", err);
    process.exit(1);
  });
}
