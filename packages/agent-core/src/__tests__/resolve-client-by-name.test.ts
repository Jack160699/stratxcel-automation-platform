// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/resolve-client-by-name.test.ts
import assert from "node:assert/strict";
import { matchClientsByName, type ClientCandidate } from "../tools/admin/resolve-client.ts";

const CLIENTS: ClientCandidate[] = [
  { id: "t-stratxcel", slug: "stratxcel", name: "Stratxcel" },
  { id: "t-solar", slug: "solarco-bhilai", name: "SolarCo Bhilai" },
  { id: "t-carrental", slug: "swift-rentals", name: "Swift Car Rentals" },
];

function run() {
  // Exact, case-insensitive match on name.
  {
    const result = matchClientsByName("stratxcel", CLIENTS);
    assert.equal(result.status, "single_match");
    assert.equal((result as { tenantId: string }).tenantId, "t-stratxcel");
  }

  // Exact, case-insensitive match on slug.
  {
    const result = matchClientsByName("Swift-Rentals", CLIENTS);
    assert.equal(result.status, "single_match");
    assert.equal((result as { tenantId: string }).tenantId, "t-carrental");
  }

  // Single unambiguous substring match ("solar" only appears in one name).
  {
    const result = matchClientsByName("solar company", CLIENTS);
    // "solar company" itself is not a substring of "SolarCo Bhilai" nor vice
    // versa -- confirm the real behavior is a real no_match here, not a
    // hopeful partial guess. This is the whole point: never invent a match.
    assert.equal(result.status, "no_match");
  }
  {
    const result = matchClientsByName("solar", CLIENTS);
    assert.equal(result.status, "single_match");
    assert.equal((result as { tenantId: string }).tenantId, "t-solar");
  }

  // Multiple partial matches -> disambiguate, never silently pick one.
  {
    const ambiguous: ClientCandidate[] = [
      { id: "t-a", slug: "acme-solar", name: "Acme Solar" },
      { id: "t-b", slug: "beta-solar", name: "Beta Solar" },
    ];
    const result = matchClientsByName("solar", ambiguous);
    assert.equal(result.status, "multiple_matches");
    assert.equal((result as { candidates: unknown[] }).candidates.length, 2);
  }

  // An exact match wins even when a different tenant's name also contains
  // the query as a substring.
  {
    const withOverlap: ClientCandidate[] = [
      { id: "t-exact", slug: "solar", name: "Solar" },
      { id: "t-broader", slug: "solar-extended", name: "Solar Extended Services" },
    ];
    const result = matchClientsByName("Solar", withOverlap);
    assert.equal(result.status, "single_match");
    assert.equal((result as { tenantId: string }).tenantId, "t-exact");
  }

  // No match at all.
  {
    const result = matchClientsByName("nonexistent business xyz", CLIENTS);
    assert.equal(result.status, "no_match");
  }

  // Empty/whitespace-only query never matches everything by accident.
  {
    assert.equal(matchClientsByName("", CLIENTS).status, "no_match");
    assert.equal(matchClientsByName("   ", CLIENTS).status, "no_match");
  }

  // Zero candidates never throws.
  {
    assert.equal(matchClientsByName("anything", []).status, "no_match");
  }

  console.log("resolve-client-by-name.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
