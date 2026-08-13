import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOLUTION_OUTCOMES } from "../../solutions/outcomes.ts";
import { GROWTH_LIFECYCLE } from "../../solutions/lifecycle.ts";
import { PLATFORM_WORK_STAGES } from "../../solutions/how-it-works.ts";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");
assert.equal(SOLUTION_OUTCOMES.length, 10);
assert.equal(GROWTH_LIFECYCLE.length, 6);
assert.equal(PLATFORM_WORK_STAGES.length, 4);
assert.ok(/SolutionsHero/.test(read("app", "solutions", "page.tsx")));
assert.ok(/BuiltAroundYourBusinessSection/.test(read("app", "solutions", "page.tsx")));
assert.ok(/ImprovementIntentSection/.test(read("app", "solutions", "page.tsx")));
assert.ok(/Not sure where to start\?/.test(read("app", "components", "public", "solutions", "AuditFunnelCta.tsx")));
assert.ok(/redirect\(["']\/solutions["']\)/.test(read("app", "use-cases", "page.tsx")));
assert.ok(/getPublishedSolutionSlugs/.test(read("app", "solutions", "[slug]", "page.tsx")));
// The homepage previews business verticals as a small number of premium
// categories and routes to the full ten-type system on /solutions, rather than
// listing ten equal cards inline.
const homeBusinessTypes = read("app", "components", "public", "home", "HomeBusinessTypes.tsx");
assert.ok(/HomeBusinessTypes/.test(read("app", "page.tsx")));
assert.ok(/getLocalBusinessVerticalBySlug/.test(homeBusinessTypes));
assert.ok(/LOCAL_BUSINESS_JOURNEY_STAGES/.test(homeBusinessTypes));
assert.ok(/\/solutions#built-around-your-business/.test(homeBusinessTypes));
console.log("public-solutions-funnel.test.ts: ALL PASS");
