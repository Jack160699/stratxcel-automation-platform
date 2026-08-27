// Loads one named credential from a `vercel env pull`-produced local file
// directly into process.env, WITHOUT ever logging, printing, or returning
// the raw value to any caller. Used so the quality-campaign scripts can
// authenticate with the project's real Vercel-configured AI credentials
// (per explicit instruction: use the existing Vercel-configured key, never
// paste/fabricate a replacement) while guaranteeing the secret itself never
// appears in console output, written files, or command history.
//
// A true Vercel "Secret"-type variable (write-only once set) cannot be
// retrieved via `vercel env pull` at all -- Vercel writes the literal
// placeholder "[SENSITIVE]" in its place. This loader treats that
// placeholder as "not accessible", never as a usable value.

import fs from "node:fs";

export type CredentialLoadResult =
  | { status: "loaded"; length: number }
  | { status: "not_found_in_file" }
  | { status: "file_missing" }
  | { status: "placeholder_not_retrievable" };

/** Parses a dotenv-style file line matching `name=value` (optionally quoted). */
function readEnvVar(filePath: string, name: string): string | null {
  const content = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]*)"?\\s*$`, "m");
  const match = content.match(pattern);
  return match ? match[1] : null;
}

/** Loads `name` from `filePath` into process.env[name]. Returns only
 * metadata (never the value) so callers can log/report status safely. */
export function loadVercelCredential(filePath: string, name: string): CredentialLoadResult {
  if (!fs.existsSync(filePath)) return { status: "file_missing" };
  const value = readEnvVar(filePath, name);
  if (value === null) return { status: "not_found_in_file" };
  if (value === "[SENSITIVE]" || value === "SENSITIVE" || !value.trim()) {
    return { status: "placeholder_not_retrievable" };
  }
  process.env[name] = value;
  return { status: "loaded", length: value.length };
}
