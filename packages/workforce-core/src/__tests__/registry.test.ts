// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/registry.test.ts
import assert from "node:assert/strict";
import { DEPARTMENT_KEYS } from "../departments/types.ts";
import { assertDepartment, listDepartments } from "../departments/registry.ts";
import { ROLE_REGISTRY, assertRole, listAllRoles, listRolesForDepartment } from "../roles/registry.ts";
import { getCapability } from "../capabilities/registry.ts";

function run() {
  assert.equal(DEPARTMENT_KEYS.length, 25);
  assert.equal(listDepartments().length, 25);

  for (const key of DEPARTMENT_KEYS) {
    const roles = listRolesForDepartment(key);
    assert.ok(roles.length >= 2, `${key} should have roles`);
  }

  assert.ok(Object.keys(ROLE_REGISTRY).length >= 80);
  assert.throws(() => assertDepartment("fake_department"), /unknown_department/);
  assert.throws(() => assertRole("research", "fake_role"), /unknown_role/);

  assert.equal(getCapability("research.web")?.status, "PLANNED");
  assert.equal(getCapability("social.publish")?.status, "AVAILABLE");
  const video = getCapability("media.video_generation")?.status;
  assert.ok(video === "UNAVAILABLE" || video === "NOT_CONFIGURED");

  console.log("registry.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
