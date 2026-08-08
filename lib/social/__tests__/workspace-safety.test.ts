import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
} from "../repositories/agent-attachments.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const text = new File(["hello"], "brief.txt", { type: "text/plain" });
  const unsupported = new File(["hello"], "brief.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const empty = new File([], "empty.txt", { type: "text/plain" });
  assert.equal(validateAttachment(text), null);
  assert.match(validateAttachment(unsupported) ?? "", /Unsupported file type/);
  assert.match(validateAttachment(empty) ?? "", /between 1 byte and 10 MB/);
  assert.equal(MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024);

  const shell = read("app", "admin", "social", "SocialShell.tsx");
  assert.ok(shell.includes("h-[100dvh]"));
  assert.ok(shell.includes("saut:shell:sidebar-pinned"));
  assert.ok(shell.includes("overflow-y-auto"));

  const workspace = read("app", "admin", "social", "copilot", "ResizableWorkspace.tsx");
  assert.ok(workspace.includes('role="separator"'));
  assert.ok(workspace.includes("ArrowLeft") && workspace.includes("ArrowRight"));
  assert.ok(workspace.includes("saut:copilot:workspace-layout"));
  assert.ok(workspace.includes('"chat", "progress", "context"'));

  const migration = read("supabase", "migrations", "20260728151255_copilot_attachments_and_settings_fix.sql");
  assert.ok(migration.includes("'MANUAL', 'SUPERVISED', 'AUTOPILOT'"));
  assert.ok(migration.includes("'social-agent-attachments'"));
  assert.ok(migration.includes("social_agent_attachments enable row level security"));
  assert.ok(migration.includes("storage.foldername(name)"));
  assert.ok(migration.includes("'ATTACHMENT_ACCESSED'"));

  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  assert.equal(orchestrator.includes("extracted_text"), false, "attachments never enter external AI prompts");
  assert.ok(orchestrator.includes("selectGeminiBrandInstructions"), "Gemini receives only allowlisted brand fields");
  assert.ok(orchestrator.includes("requiresLocalMetaHandling"), "Platform-data questions stay local");
  const attachments = read("lib", "social", "repositories", "agent-attachments.ts");
  const copilot = read("app", "admin", "social", "copilot", "CopilotFullPage.tsx");
  assert.ok(attachments.includes("createSignedUploadUrl"), "uploads must bypass the Vercel function body-size limit");
  assert.ok(copilot.includes("uploadToSignedUrl"), "browser must upload directly to the private storage source");
  assert.ok(attachments.includes("finalizeAgentAttachment"), "server must verify and finalize uploaded objects");

  const legalRoutes = [
    "privacy",
    "terms",
    "refund-cancellation",
    "data-deletion",
    "acceptable-use",
    "domain-website-terms",
    "third-party-providers",
    "data-processing-terms",
  ];
  for (const route of legalRoutes) {
    assert.ok(fs.existsSync(path.join(root, "app", "(marketing)", route, "page.tsx")), `${route} route must exist`);
  }
  const nav = read("lib", "site-nav.js");
  for (const route of legalRoutes) assert.ok(nav.includes(`href: "/${route}"`), `footer must link /${route}`);

  console.log("workspace-safety.test.ts: ALL PASS (shell, resizing, attachments, canonical settings, legal routes)");
}

run();
