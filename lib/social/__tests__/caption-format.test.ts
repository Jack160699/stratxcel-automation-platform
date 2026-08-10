// Tests the "Ready to publish" card's hashtag de-duplication (Section 4 of
// the live-progress cleanup brief): a caption that already ends with the
// same hashtags stored in the structured hashtags array must render once,
// not twice — without ever touching real caption content that doesn't
// actually duplicate the structured tags.
// Run with: node --experimental-strip-types lib/social/__tests__/caption-format.test.ts

import assert from "node:assert/strict";
import { dedupeCaptionForPreview } from "../agent/caption-format.ts";

function run() {
  // Exact trailing duplicate — strip for preview.
  assert.equal(
    dedupeCaptionForPreview(
      "ChatGPT is more than a Q&A chatbot.\n\n#AIAutomation #DigitalTransformation #Stratxcel",
      ["AIAutomation", "DigitalTransformation", "Stratxcel"]
    ),
    "ChatGPT is more than a Q&A chatbot."
  );

  // Case/# insensitivity in the match.
  assert.equal(
    dedupeCaptionForPreview("Body text\n#aiautomation #STRATXCEL", ["AIAutomation", "Stratxcel"]),
    "Body text"
  );

  // No structured hashtags at all -> caption untouched.
  assert.equal(dedupeCaptionForPreview("Body text #Foo", []), "Body text #Foo");

  // Trailing tags that only partially match the structured array are left
  // alone — safer to show a rare duplicate than risk stripping real content.
  assert.equal(
    dedupeCaptionForPreview("Body text\n#AIAutomation #SomethingElse", ["AIAutomation"]),
    "Body text\n#AIAutomation #SomethingElse"
  );

  // No trailing hashtag block at all -> untouched, even if hashtags exist.
  assert.equal(dedupeCaptionForPreview("Just a caption, no tags.", ["AIAutomation"]), "Just a caption, no tags.");

  // Hashtags embedded mid-caption (not trailing) are never stripped.
  assert.equal(
    dedupeCaptionForPreview("Check out #AIAutomation today — big news.", ["AIAutomation"]),
    "Check out #AIAutomation today — big news."
  );

  // Empty caption is a safe no-op.
  assert.equal(dedupeCaptionForPreview("", ["AIAutomation"]), "");

  console.log("caption-format.test.ts: ALL PASS (exact trailing dedupe, case-insensitivity, partial/embedded/no-tag caption left untouched)");
}

run();
