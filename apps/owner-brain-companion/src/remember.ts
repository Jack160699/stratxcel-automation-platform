import readline from "node:readline/promises";
import { enqueue, flushQueue } from "./queue.ts";

/** `npm run remember -- "text"` (or interactive if no arg) — the explicit "remember this" manual action from the brief, sent as a manual_note signal and flushed immediately rather than waiting for the next periodic sync. */
export async function runRemember(argText?: string): Promise<void> {
  let text = argText;
  if (!text) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    text = (await rl.question("What should I remember? ")).trim();
    rl.close();
  }
  if (!text) {
    console.error("Nothing entered.");
    process.exitCode = 1;
    return;
  }

  enqueue({ type: "manual_note", occurredAt: new Date().toISOString(), note: text });
  const result = await flushQueue();
  console.log(result.error ? `Saved locally — will sync when online (${result.error})` : "Saved and synced.");
}
