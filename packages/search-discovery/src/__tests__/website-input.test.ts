// Regression for the real, live defect found and fixed
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 17): the real
// server-side gate on manual "Run Search Analysis" submissions
// (app/api/platform/search/run/route.ts) called `new URL(value)` directly
// on the raw customer input. `new URL()` throws for a bare domain with no
// scheme, so a customer typing exactly what they'd naturally type
// ("stratxcel.in") was rejected -- only a fully-qualified
// "https://stratxcel.in" ever worked. Customers should not need to know
// URL syntax.
//
// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/website-input.test.ts
import assert from "node:assert/strict";
import { normalizeWebsiteInput, websiteMatchKey } from "../website-input.ts";

function expectOk(raw: string, expectedUrl: string, label?: string) {
  const result = normalizeWebsiteInput(raw);
  assert.equal(result.ok, true, `${label ?? raw}: expected ok, got ${JSON.stringify(result)}`);
  if (result.ok) assert.equal(result.url, expectedUrl, `${label ?? raw}: normalized URL mismatch`);
}

function expectRejected(raw: unknown, label?: string) {
  const result = normalizeWebsiteInput(raw as string);
  assert.equal(result.ok, false, `${label ?? String(raw)}: expected rejection, got ${JSON.stringify(result)}`);
}

// --- Section 3/16: normal human formats, all accepted -----------------------
expectOk("stratxcel.in", "https://stratxcel.in");
expectOk("www.stratxcel.in", "https://www.stratxcel.in");
expectOk("https://stratxcel.in", "https://stratxcel.in");
expectOk("https://www.stratxcel.in/", "https://www.stratxcel.in");
expectOk("HTTP://STRATXCEL.IN", "http://stratxcel.in");
expectOk("  stratxcel.in  ", "https://stratxcel.in", "surrounding whitespace");
expectOk("StratXcel.in", "https://stratxcel.in", "mixed case");
expectOk("jandarpan.news", "https://jandarpan.news");
expectOk("www.jandarpan.news", "https://www.jandarpan.news");
expectOk("https://jandarpan.news/", "https://jandarpan.news");
expectOk("ascendtheory.in", "https://ascendtheory.in");
expectOk("www.ascendtheory.in", "https://www.ascendtheory.in");

// --- Section 4: meaningful path is preserved exactly, only the bare-root
//     trailing slash is considered "unnecessary" --------------------------
expectOk("stratxcel.in/blog/", "https://stratxcel.in/blog/", "real path keeps its own trailing slash");
expectOk("stratxcel.in/blog", "https://stratxcel.in/blog", "real path with no trailing slash is untouched");

// --- Section 15: reject only genuinely invalid values -----------------------
expectRejected("", "empty string");
expectRejected("   ", "whitespace only");
expectRejected(undefined, "non-string input");
expectRejected(null, "non-string input");
expectRejected("not a domain at all with spaces", "garbage text");
expectRejected("javascript:alert(1)", "unsupported/unsafe protocol");
expectRejected("file:///etc/passwd", "unsupported/unsafe protocol");
expectRejected("ftp://stratxcel.in", "unsupported protocol");
expectRejected("http://user:pass@stratxcel.in", "credentials in URL");
expectRejected("http://localhost", "private/internal host");
expectRejected("http://127.0.0.1", "private/internal host");
expectRejected("http://192.168.1.1", "private/internal host");
expectRejected("http://169.254.169.254", "cloud metadata host");

// --- Section 5/7/34: one canonical identity for matching, without
//     silently rewriting what the customer typed or what gets stored -------
// "Do NOT blindly delete www if the difference is technically meaningful":
// the resolved, storable URL keeps www exactly as given.
{
  const withWww = normalizeWebsiteInput("www.stratxcel.in");
  const withoutWww = normalizeWebsiteInput("stratxcel.in");
  assert.ok(withWww.ok && withoutWww.ok);
  if (withWww.ok && withoutWww.ok) {
    assert.notEqual(withWww.url, withoutWww.url, "the resolved/storable URL must not silently drop a meaningful www");
    assert.equal(withWww.matchKey, withoutWww.matchKey, "but the match key must still recognize them as the same website identity");
  }
}
// The full Section 34 regression set: all represent one identity.
{
  const variants = ["stratxcel.in", "www.stratxcel.in", "https://stratxcel.in", "https://www.stratxcel.in/", "https://WWW.STRATXCEL.IN/"];
  const keys = variants.map((v) => {
    const r = normalizeWebsiteInput(v);
    assert.ok(r.ok, `${v} must normalize successfully`);
    return r.ok ? r.matchKey : null;
  });
  const distinct = new Set(keys);
  assert.equal(distinct.size, 1, `all Section 34 variants must share one match key, got: ${JSON.stringify(keys)}`);
}
// scheme/case/trailing-slash variants of the *same literal domain* collapse
// to the identical storable URL too -- this is what makes the existing
// real DB constraint (UNIQUE (tenant_id, property_url) on search_projects)
// actually prevent duplicates for these variants without any app-level
// dedupe logic of its own.
{
  const sameStorable = ["stratxcel.in", "https://stratxcel.in", "https://stratxcel.in/", "HTTPS://STRATXCEL.IN/"];
  const urls = sameStorable.map((v) => {
    const r = normalizeWebsiteInput(v);
    assert.ok(r.ok);
    return r.ok ? r.url : null;
  });
  const distinct = new Set(urls);
  assert.equal(distinct.size, 1, `scheme/case/trailing-slash variants of the same domain must resolve to one identical storable URL, got: ${JSON.stringify(urls)}`);
}

// --- websiteMatchKey directly: used to compare an existing known source
//     (e.g. a connected Search Console property) against a fresh input ------
assert.equal(websiteMatchKey("https://www.stratxcel.in/"), websiteMatchKey("https://stratxcel.in"));
assert.equal(websiteMatchKey("not a url"), null);

console.log("website-input.test.ts: ALL PASS");
