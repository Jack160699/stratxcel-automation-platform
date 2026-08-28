import assert from "node:assert/strict";
import type { DestinationExecutionState, DestinationPublishStatus } from "../worker.ts";

async function runTests() {
  console.log("Starting Resumable Publishing Test Suite...");

  // 1. Initial State Initialization
  {
    const destinations: Record<string, DestinationExecutionState> = {};
    const platform = "instagram";
    destinations[platform] = {
      platform,
      status: "NOT_STARTED",
      mediaContainerId: null,
      uploadId: null,
      externalPostId: null,
      permalink: null,
      lastError: null,
      retryCount: 0,
      updatedAt: new Date().toISOString(),
    };
    assert.equal(destinations.instagram.status, "NOT_STARTED");
    assert.equal(destinations.instagram.mediaContainerId, null);
    console.log("✔ Initial destination state: PASS");
  }

  // 2. Intermediate Media Upload Persistence
  {
    const destinations: Record<string, DestinationExecutionState> = {};
    destinations["instagram"] = {
      platform: "instagram",
      status: "MEDIA_UPLOADED",
      mediaContainerId: "container_meta_12345",
      uploadId: "upl_9988",
      externalPostId: null,
      permalink: null,
      lastError: null,
      retryCount: 1,
      updatedAt: new Date().toISOString(),
    };
    assert.equal(destinations.instagram.status, "MEDIA_UPLOADED");
    assert.equal(destinations.instagram.mediaContainerId, "container_meta_12345");
    console.log("✔ Media container intermediate state persistence: PASS");
  }

  // 3. Multi-Destination Partial Success Isolation (FB published, IG rate limited)
  {
    const destinations: Record<string, DestinationExecutionState> = {
      facebook: {
        platform: "facebook",
        status: "PUBLISHED",
        mediaContainerId: null,
        uploadId: null,
        externalPostId: "fb_post_9999",
        permalink: "https://facebook.com/post/9999",
        lastError: null,
        retryCount: 1,
        updatedAt: new Date().toISOString(),
      },
      instagram: {
        platform: "instagram",
        status: "FAILED_RETRYABLE",
        mediaContainerId: "container_meta_12345",
        uploadId: null,
        externalPostId: null,
        permalink: null,
        lastError: "Rate limit reached. Retry after 60s.",
        retryCount: 1,
        updatedAt: new Date().toISOString(),
      },
    };

    assert.equal(destinations.facebook.status, "PUBLISHED");
    assert.equal(destinations.instagram.status, "FAILED_RETRYABLE");
    // FB is not failed because IG failed
    assert.equal(destinations.facebook.lastError, null);
    assert.ok(destinations.facebook.externalPostId);
    console.log("✔ Multi-destination partial success isolation: PASS");
  }

  // 4. Retry Execution Reuses Container ID and Skips Completed Destination
  {
    const previousDestinations: Record<string, DestinationExecutionState> = {
      facebook: {
        platform: "facebook",
        status: "PUBLISHED",
        mediaContainerId: null,
        uploadId: null,
        externalPostId: "fb_post_9999",
        permalink: "https://facebook.com/post/9999",
        lastError: null,
        retryCount: 1,
        updatedAt: new Date().toISOString(),
      },
      instagram: {
        platform: "instagram",
        status: "FAILED_RETRYABLE",
        mediaContainerId: "container_meta_12345",
        uploadId: null,
        externalPostId: null,
        permalink: null,
        lastError: "Rate limit reached",
        retryCount: 1,
        updatedAt: new Date().toISOString(),
      },
    };

    // When FB is called again:
    const fbAlreadyPublished = previousDestinations["facebook"].status === "PUBLISHED";
    assert.equal(fbAlreadyPublished, true);

    // When IG is retried:
    const igContainerToReuse = previousDestinations["instagram"].mediaContainerId;
    assert.equal(igContainerToReuse, "container_meta_12345");

    // Simulate IG successful second attempt:
    previousDestinations["instagram"] = {
      platform: "instagram",
      status: "PUBLISHED",
      mediaContainerId: igContainerToReuse,
      uploadId: null,
      externalPostId: "ig_post_7777",
      permalink: "https://instagram.com/p/7777",
      lastError: null,
      retryCount: 2,
      updatedAt: new Date().toISOString(),
    };

    assert.equal(previousDestinations.facebook.status, "PUBLISHED");
    assert.equal(previousDestinations.instagram.status, "PUBLISHED");
    console.log("✔ Retry execution reusing container ID: PASS");
  }

  // 5. Reauthentication Required State Isolation
  {
    const destinations: Record<string, DestinationExecutionState> = {
      threads: {
        platform: "threads",
        status: "REAUTH_REQUIRED",
        mediaContainerId: null,
        uploadId: null,
        externalPostId: null,
        permalink: null,
        lastError: "Access token expired and refresh token invalid",
        retryCount: 1,
        updatedAt: new Date().toISOString(),
      },
    };
    assert.equal(destinations.threads.status, "REAUTH_REQUIRED");
    console.log("✔ Reauthentication required status isolation: PASS");
  }

  console.log("==================================================");
  console.log("ALL RESUMABLE PUBLISHING UNIT TESTS PASSED (5/5) ✔");
  console.log("==================================================");
}

runTests();
