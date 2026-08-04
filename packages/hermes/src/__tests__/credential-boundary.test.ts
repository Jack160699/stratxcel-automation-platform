// Run with: node --experimental-strip-types packages/hermes/src/__tests__/credential-boundary.test.ts
import assert from "node:assert/strict";
import { assertNoForbiddenCredentials, ForbiddenCredentialError } from "../credential-boundary.ts";

function run() {
  // Clean, ordinary context bundles pass through untouched.
  assert.doesNotThrow(() =>
    assertNoForbiddenCredentials({
      missionId: "m1",
      goalText: "write a blog post",
      brandBrain: { tone: "friendly", facts: ["we sell shoes"] },
      nested: { deeply: { fine: true } },
      list: [1, "two", { three: 3 }],
    })
  );

  // Forbidden key names, at any depth.
  assert.throws(() => assertNoForbiddenCredentials({ supabase_service_role: "whatever" }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ SERVICE_ROLE_KEY: "whatever" }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ nested: { vercel_token: "whatever" } }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ github_pat: "whatever" }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ meta_access_token: "whatever" }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ razorpay_key_secret: "whatever" }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ ssh_private_key: "whatever" }), ForbiddenCredentialError);
  assert.throws(() => assertNoForbiddenCredentials({ docker_socket_path: "whatever" }), ForbiddenCredentialError);

  // Forbidden value *shapes*, even under an innocuous key name.
  assert.throws(() => assertNoForbiddenCredentials({ note: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }), ForbiddenCredentialError);
  assert.throws(
    () => assertNoForbiddenCredentials({ note: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----" }),
    ForbiddenCredentialError
  );
  assert.throws(() => assertNoForbiddenCredentials({ note: "mounted at /var/run/docker.sock" }), ForbiddenCredentialError);

  // Arrays are scanned too.
  assert.throws(() => assertNoForbiddenCredentials(["fine", { razorpay_secret: "x" }]), ForbiddenCredentialError);

  // null/undefined/primitives at the top level never throw.
  assert.doesNotThrow(() => assertNoForbiddenCredentials(null));
  assert.doesNotThrow(() => assertNoForbiddenCredentials(undefined));
  assert.doesNotThrow(() => assertNoForbiddenCredentials(42));
  assert.doesNotThrow(() => assertNoForbiddenCredentials("just a normal string"));

  console.log("credential-boundary.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
