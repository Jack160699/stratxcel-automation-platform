/**
 * Client-safe entry point for @stratxcel/websites-and-domains.
 *
 * Import from "@stratxcel/websites-and-domains/client" (never the package
 * root) in any "use client" component. This re-exports only the pure,
 * deterministic creator/brief state machine and its types: no Node
 * built-ins, no network I/O, no server secrets.
 *
 * The package root ("." -> src/index.ts) additionally re-exports domains/
 * (live DNS lookups via node:dns/promises), hosting/ and registrar/
 * (Vercel + domain-registrar API calls signed with server-only secrets),
 * and preview/ (HMAC signing via node:crypto). Those must only ever run
 * on the server. Importing the package root from a "use client" component
 * pulls that whole graph into the browser chunk: it both leaks server-only
 * surface area toward the client and breaks the production build outright,
 * because node:dns/promises cannot be chunked for the browser
 * ("the chunking context (unknown) does not support external modules
 * (request: node:dns/promises)" — the Turbopack error that took down the
 * last two production deployments of /app/website).
 */
export * from "./creator/index.ts";
export * from "./brief/types.ts";
// Pure string synthesis only (no I/O) — safe for the client bundle, same
// as everything else re-exported here. Needed so the "Create Your Website"
// workspace can compile the real prompt it sends to the server-side
// generation endpoint (POST /api/platform/website-factory) instead of
// invoking WebsiteGenerationEngine locally, which never persists anything.
export { compileMasterWebsitePrompt } from "./brief/master-prompt.ts";
