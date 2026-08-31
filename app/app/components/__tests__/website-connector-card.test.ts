// Regression for the Website connector card (docs/discovery/
// SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 18): the real, mature Vercel
// connector backend (packages/search-discovery/src/vercel/, real
// connect/disconnect/discover API routes) previously had zero customer-
// facing UI -- confirmed by exhaustive grep before building this: nothing
// in app/ or components/ ever read search_website_connections or
// search_website_connection_projects. Static-source-assertion pattern
// (this repo has zero .test.tsx execution capability, same constraint as
// every other component test this session).
//
// Run with: node --experimental-strip-types app/app/components/__tests__/website-connector-card.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const card = stripComments(read("app", "app", "components", "WebsiteConnectorCard.tsx"));
const integrationsPage = stripComments(read("app", "app", "integrations", "page.tsx"));

// --- actually wired into the real Connector page, not just built and orphaned ---
assert.match(integrationsPage, /import \{ WebsiteConnectorCard \} from "\.\.\/components\/WebsiteConnectorCard"/, "WebsiteConnectorCard must be imported into /app/integrations");
assert.match(integrationsPage, /<WebsiteConnectorCard tenantId=\{tenantId\}/, "WebsiteConnectorCard must actually be rendered on /app/integrations, not just imported");

// --- uses the real, existing backend -- never a second, fabricated connection mechanism ---
assert.match(card, /\/api\/platform\/search\/website\/status/, "must read real status from the real status endpoint");
assert.match(card, /\/api\/platform\/search\/vercel\/connect/, "must call the real, existing Vercel connect route -- never a new/duplicate connect mechanism");
assert.match(card, /\/api\/platform\/search\/vercel\/discover/, "must call the real, existing Vercel discover route");
assert.match(card, /\/api\/platform\/search\/vercel\/disconnect/, "must call the real, existing Vercel disconnect route");

// --- never fabricates a successful connection or a guessed platform --------
assert.doesNotMatch(card, /connected:\s*true/, "must never locally fabricate a 'connected: true' state -- only the real backend response can report that");
// The honest fallback label is "Unknown" -- must show that, not silently omit the row or invent a specific framework name when detection genuinely found nothing.
assert.match(card, /detectedPlatform\s*\?\?\s*"Unknown"/, "must show the honest 'Unknown' label when no platform was actually detected, never a blank row or a guessed framework name");

// --- analysis access vs. write access are shown as distinct, not conflated ---
assert.match(card, /Website analysis/, "must show analysis-readiness separately from write access");
assert.match(card, /Automatic website changes/, "must show write-access/automatic-changes state separately, never implying deploy capability that doesn't exist");

// --- token is a paste-once flow (the real Vercel connector model), never OAuth-redirect-only ---
assert.match(card, /type="password"/, "the Vercel token input must exist for the real paste-once flow");

console.log("website-connector-card.test.ts: ALL PASS");
