// Guards against the five regressions found by production policy inspection
// on the Social Autopilot tables (see 20260803110500_harden_existing_social_rls.sql
// for the corrective migration and the historical migrations it patches).
// Static policy-as-code checks on the SQL source — no live Postgres project
// is reachable this session (see docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md).
// Run with: node --experimental-strip-types supabase/__tests__/social-rls-hardening.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

// Policies that are deliberately reachable without auth.uid()-based
// ownership (e.g. the contact-form lead-capture insert). None of the
// policies tracked in this repo's migrations are on this list today; it
// exists so a genuinely-anonymous policy can be added later without
// tripping the broad-grant check below, as long as it's named here.
const DOCUMENTED_ANONYMOUS_POLICIES = new Set(["stratxcel_contact_public_insert"]);

const DANGEROUS_TABLE_PRIVILEGES = ["truncate", "references", "trigger", "maintain"];
const UNSAFE_GRANT_ROLES = ["anon", "authenticated"];

function readAllMigrations(): { file: string; sql: string }[] {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((file) => ({ file, sql: fs.readFileSync(path.join(migrationsDir, file), "utf8") }));
}

function findStatements(sql: string, startPattern: RegExp): string[] {
  // Bounds each match at the next literal `;` — policy/grant bodies in this
  // codebase never contain a semicolon, so this reliably isolates one
  // statement without needing a full SQL parser.
  const re = new RegExp(startPattern.source, startPattern.flags.includes("g") ? startPattern.flags : startPattern.flags + "g");
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const end = rest.indexOf(";");
    matches.push(end === -1 ? rest : rest.slice(0, end + 1));
  }
  return matches;
}

function run() {
  const migrations = readAllMigrations();
  const combined = migrations.map((m) => `-- FILE:${m.file}\n${m.sql}`).join("\n");
  const failures: string[] = [];

  // 1. Any "FOR ALL" policy left at the implicit PUBLIC role (no `TO` clause)
  // while its condition depends on auth.uid() is a bug: PUBLIC includes
  // `anon`, and an auth.uid()-scoped condition was never meant to be
  // evaluated for an unauthenticated request.
  for (const statement of findStatements(combined, /create policy\s+(\w+)[^;]*?\bfor\s+all\b/gi)) {
    const nameMatch = statement.match(/create policy\s+(\w+)/i);
    const name = nameMatch ? nameMatch[1] : "<unknown>";
    if (DOCUMENTED_ANONYMOUS_POLICIES.has(name)) continue;

    const hasExplicitRole = /\bfor\s+all\s+to\s+\S/i.test(statement);
    const usesAuthUid = /auth\.uid\s*\(\)/i.test(statement);
    if (!hasExplicitRole && usesAuthUid) {
      failures.push(`policy '${name}': FOR ALL with no TO clause (defaults to PUBLIC) but condition uses auth.uid() — must be scoped TO authenticated`);
    }
  }

  // 2. social_agent_actions must never let `session_id is null` bypass
  // ownership.
  for (const statement of findStatements(combined, /create policy\s+social_agent_actions_admin\b/gi)) {
    if (/session_id\s+is\s+null\b/i.test(statement)) {
      failures.push(`social_agent_actions_admin: 'session_id is null' ownership bypass present — ${statement.slice(0, 160)}`);
    }
    if (!/session_id\s+is\s+not\s+null/i.test(statement)) {
      failures.push(`social_agent_actions_admin: missing required 'session_id is not null' guard — ${statement.slice(0, 160)}`);
    }
  }

  // 3. social_conversations / social_leads must never let `account_id is
  // null` bypass ownership.
  for (const policyName of ["social_conversations_admin", "social_leads_admin"]) {
    for (const statement of findStatements(combined, new RegExp(`create policy\\s+${policyName}\\b`, "gi"))) {
      if (/account_id\s+is\s+null\b/i.test(statement)) {
        failures.push(`${policyName}: 'account_id is null' ownership bypass present — ${statement.slice(0, 160)}`);
      }
      if (!/account_id\s+is\s+not\s+null/i.test(statement)) {
        failures.push(`${policyName}: missing required 'account_id is not null' guard — ${statement.slice(0, 160)}`);
      }
    }
  }

  // 4. social_messages must verify account ownership (conversation ->
  // account -> owner_id = auth.uid()), not just that the parent conversation
  // row exists.
  for (const statement of findStatements(combined, /create policy\s+social_messages_admin\b/gi)) {
    const checksAccountOwnership =
      /social_accounts/i.test(statement) && /owner_id/i.test(statement) && /auth\.uid\s*\(\)/i.test(statement);
    if (!checksAccountOwnership) {
      failures.push(`social_messages_admin: does not verify social_accounts.owner_id = auth.uid() — conversation-existence-only check is insufficient — ${statement.slice(0, 160)}`);
    }
  }

  // 5. Nobody but service_role/supabase_admin should ever receive TRUNCATE,
  // TRIGGER, REFERENCES, or MAINTAIN via a project migration.
  for (const statement of findStatements(combined, /\bgrant\b/gi)) {
    const lower = statement.toLowerCase();
    if (!lower.includes("grant")) continue;
    const grantsDangerousPrivilege = DANGEROUS_TABLE_PRIVILEGES.some((p) => new RegExp(`\\b${p}\\b`).test(lower));
    if (!grantsDangerousPrivilege) continue;
    const toClause = lower.match(/\bto\s+([a-z0-9_,\s]+?)\s*;?\s*$/);
    if (!toClause) continue;
    for (const role of UNSAFE_GRANT_ROLES) {
      if (new RegExp(`\\b${role}\\b`).test(toClause[1])) {
        failures.push(`unsafe privilege grant to '${role}' — "${statement.replace(/\s+/g, " ").trim().slice(0, 160)}"`);
      }
    }
  }

  assert.deepEqual(failures, [], `Social RLS hardening violations found:\n${failures.join("\n")}`);

  console.log(`social-rls-hardening.test.ts: scanned ${migrations.length} migrations — ALL PASS`);
}

run();
