import crypto from "node:crypto";

/** Pure, dependency-free — split out so it's directly testable without pulling in the DB-touching parts of desktop-devices.ts. See __tests__/desktop-devices.test.ts. */
export function hashPairingCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}
