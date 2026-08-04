// Run with: node --experimental-strip-types packages/hermes/src/__tests__/profiles.test.ts
import assert from "node:assert/strict";
import {
  PROFILE_POLICIES,
  getProfilePolicy,
  isStratxcelToolAllowedForProfile,
  doesStratxcelToolRequireApproval,
  resolveHermesNativeProfile,
} from "../profiles.ts";
import { ALL_TOOL_NAMES, STRATXCEL_CONTROLLED_TOOLS } from "../tools/contracts.ts";
import { ProfileName } from "@stratxcel/hermes-contract";

function run() {
  // All ten profiles from ProfileName have a policy, and every listed
  // allowed tool is one of the real 12 tools apps/hermes-gateway
  // recognizes — a profile can never be granted a tool the gateway
  // wouldn't dispatch.
  for (const profile of ProfileName.options) {
    const policy = getProfilePolicy(profile);
    assert.equal(policy.profile, profile);
    for (const tool of policy.stratxcelTools.allowed) {
      assert.ok(ALL_TOOL_NAMES.includes(tool), `${profile} allows unknown tool ${tool}`);
    }
  }
  assert.equal(Object.keys(PROFILE_POLICIES).length, ProfileName.options.length);

  // content and social never get the two StratExcel-controlled tools.
  for (const profile of ["content", "social"] as const) {
    for (const controlled of STRATXCEL_CONTROLLED_TOOLS) {
      assert.equal(isStratxcelToolAllowedForProfile(profile, controlled), false);
    }
  }

  // website-development is granted create_website_change_request, but it
  // always requires approval — granted and gated are not the same thing.
  assert.equal(isStratxcelToolAllowedForProfile("website-development", "create_website_change_request"), true);
  assert.equal(doesStratxcelToolRequireApproval("website-development", "create_website_change_request"), true);

  // Any STRATXCEL_CONTROLLED_TOOLS member requires approval for every
  // profile, even one that doesn't explicitly list it (defense-in-depth:
  // the global control always applies).
  assert.equal(doesStratxcelToolRequireApproval("research", "submit_publish_request"), true);

  // Service-key mapping is precise where available...
  assert.equal(resolveHermesNativeProfile({ service_key: "social_campaign", hermes_profile: "stratxcel-content" }), "social");
  assert.equal(resolveHermesNativeProfile({ service_key: "content_calendar", hermes_profile: "stratxcel-content" }), "content");
  assert.equal(resolveHermesNativeProfile({ service_key: "seo_audit", hermes_profile: "stratxcel-seo" }), "seo");

  // ...and falls back to the coarse label when service_key is unknown.
  assert.equal(resolveHermesNativeProfile({ service_key: "unknown_key", hermes_profile: "stratxcel-admin-growth" }), "operations");

  // ...and defaults to orchestrator when nothing matches.
  assert.equal(resolveHermesNativeProfile({ service_key: null, hermes_profile: null }), "orchestrator");

  console.log("profiles.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
