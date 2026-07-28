import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_OBJECTIVE_VALUES,
  ContentDraftValidationError,
  parseCreateContentDraft,
} from "../content-options.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function requestedYouTubeDraft(objective = "REACH", contentPillar = "Social Media Automation & Intelligence") {
  const formData = new FormData();
  formData.set("campaign_id", "");
  formData.set("title", "Google OAuth Verification Demo");
  formData.set(
    "master_idea",
    "Demonstration of StratXcel Social Autopilot's authorized YouTube publishing workflow."
  );
  formData.set("objective", objective);
  formData.set("content_pillar", contentPillar);
  formData.set("platform", "youtube");
  formData.set("format", "reel");
  formData.set("youtube_privacy_status", "private");
  formData.set("caption", "StratXcel Social Autopilot — YouTube Integration Demo");
  formData.set("hashtags", "");
  formData.set("media_urls", "");
  return formData;
}

function run() {
  assert.deepEqual(CONTENT_OBJECTIVE_VALUES, [
    "REACH",
    "ENGAGEMENT",
    "FOLLOWERS",
    "TRAFFIC",
    "LEADS",
    "SALES",
    "AUTHORITY",
    "COMMUNITY",
    "RETENTION",
  ]);

  const draft = parseCreateContentDraft(requestedYouTubeDraft(), [
    "AI Automation in Real Business",
    "Social Media Automation & Intelligence",
  ]);
  assert.equal(draft.campaignId, null);
  assert.equal(draft.title, "Google OAuth Verification Demo");
  assert.equal(draft.objective, "REACH");
  assert.equal(draft.contentPillar, "Social Media Automation & Intelligence");
  assert.equal(draft.platform, "youtube");
  assert.equal(draft.format, "reel");
  assert.equal(draft.youtubePrivacyStatus, "private");
  assert.deepEqual(draft.mediaUrls, []);
  assert.equal(draft.caption, "StratXcel Social Autopilot — YouTube Integration Demo");

  assert.throws(
    () => parseCreateContentDraft(requestedYouTubeDraft("awareness"), ["Social Media Automation & Intelligence"]),
    ContentDraftValidationError,
    "the invalid legacy frontend default must be rejected before a database insert"
  );
  assert.throws(
    () =>
      parseCreateContentDraft(requestedYouTubeDraft("REACH", "educational"), [
        "Social Media Automation & Intelligence",
      ]),
    ContentDraftValidationError,
    "configured Brand Brain pillars must be used exactly"
  );

  const formSource = fs.readFileSync(
    path.join(root, "app", "admin", "social", "create", "CreateContentForm.tsx"),
    "utf8"
  );
  const actionSource = fs.readFileSync(path.join(root, "app", "admin", "social", "actions.ts"), "utf8");
  assert.ok(formSource.includes('name="objective"') && formSource.includes("<select"));
  assert.ok(formSource.includes("useActionState"), "validation results must render in the form");
  assert.ok(actionSource.includes("ContentDraftValidationError"));
  assert.ok(
    actionSource.includes("Could not save this draft. Please review the fields and try again."),
    "unexpected database errors must return a safe form error instead of crashing the route"
  );

  console.log(
    "content-create.test.ts: ALL PASS (canonical objectives, Brand Brain pillar, YouTube private draft, blank media, safe form errors)"
  );
}

run();
