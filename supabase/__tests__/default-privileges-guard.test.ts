// Guards against a regression we shipped twice: ALTER DEFAULT PRIVILEGES is a
// sticky ACL entry keyed to the granting role, not a per-migration effect —
// once `alter default privileges in schema public grant ... to authenticated`
// runs against a database, every table created afterwards silently inherits
// that grant regardless of its own RLS policy, and simply removing the
// statement from the migration file does not undo it (see
// 20260803110000_revoke_unsafe_default_privileges.sql for the corrective
// revoke). This test fails loudly if any migration — historical or future —
// reintroduces a broad ALTER DEFAULT PRIVILEGES GRANT on public tables or
// sequences to `anon` or `authenticated`. service_role is exempt: it must
// keep default CRUD on future tables so server-side clients keep working.
// REVOKE statements (the corrective migration) are intentionally allowed.
// Run with: node --experimental-strip-types supabase/__tests__/default-privileges-guard.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

const UNSAFE_ROLES = ["anon", "authenticated"];

function run() {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  assert.ok(files.length > 0, "expected to find migration files");

  const failures: string[] = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    for (const rawStatement of sql.split(";")) {
      const statement = rawStatement.replace(/\s+/g, " ").trim().toLowerCase();
      if (!statement.startsWith("alter default privileges")) continue;
      if (!/\bgrant\b/.test(statement)) continue; // REVOKE statements are the sanctioned fix, not the problem.

      const toClause = statement.match(/\bto\s+([a-z0-9_,\s]+)$/);
      if (!toClause) continue;

      for (const role of UNSAFE_ROLES) {
        if (new RegExp(`\\b${role}\\b`).test(toClause[1])) {
          failures.push(`${file}: broad ALTER DEFAULT PRIVILEGES GRANT to '${role}' — "${statement.slice(0, 120)}"`);
        }
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Unsafe default-privilege grants found (these silently hand every future public table/sequence to anon or authenticated, bypassing per-table RLS):\n${failures.join("\n")}`
  );

  console.log(`default-privileges-guard.test.ts: scanned ${files.length} migrations — ALL PASS`);
}

run();
