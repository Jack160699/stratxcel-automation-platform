// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/registry.test.ts
import assert from "node:assert/strict";
import { DEPARTMENT_KEYS } from "../departments/types.ts";
import { assertDepartment, listDepartments } from "../departments/registry.ts";
import { ROLE_REGISTRY, assertRole, listAllRoles, listRolesForDepartment } from "../roles/registry.ts";
import { CAPABILITY_KEYS } from "../capabilities/types.ts";
import { getCapability, listCapabilities } from "../capabilities/registry.ts";

function run() {
  assert.equal(DEPARTMENT_KEYS.length, 25);
  assert.equal(listDepartments().length, 25);

  for (const key of DEPARTMENT_KEYS) {
    const roles = listRolesForDepartment(key);
    assert.ok(roles.length >= 2, `${key} should have roles`);
  }

  assert.ok(Object.keys(ROLE_REGISTRY).length >= 80);
  assert.ok(listAllRoles().length >= 80);
  assert.throws(() => assertDepartment("fake_department"), /unknown_department/);
  assert.throws(() => assertRole("research", "fake_role"), /unknown_role/);

  assert.equal(getCapability("research.web")?.status, "PLANNED");
  assert.equal(getCapability("social.publish")?.status, "AVAILABLE");
  assert.equal(getCapability("social.schedule")?.status, "AVAILABLE");
  assert.equal(getCapability("seo.audit")?.status, "AVAILABLE");
  assert.equal(getCapability("website.generate")?.status, "AVAILABLE");
  assert.equal(getCapability("crm.read")?.status, "AVAILABLE");
  assert.equal(getCapability("crm.write")?.status, "AVAILABLE");
  assert.equal(getCapability("whatsapp.send")?.status, "AVAILABLE");
  assert.equal(getCapability("analytics.read")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("social.schedule")?.approvalRequired, true);
  assert.equal(getCapability("website.audit")?.status, "AVAILABLE");
  assert.equal(getCapability("media.image_generation")?.status, "AVAILABLE");
  assert.equal(getCapability("media.carousel_generation")?.status, "UNAVAILABLE");
  assert.equal(getCapability("media.video_generation")?.status, "UNAVAILABLE");
  assert.equal(getCapability("content.shortform")?.status, "NOT_CONFIGURED");

  for (const def of listCapabilities()) {
    assert.ok(def.status, `every capability needs explicit status: ${def.key}`);
  }
  assert.equal(listCapabilities().length, CAPABILITY_KEYS.length);

  console.log("registry.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
