// Run with: node --experimental-strip-types packages/storage/src/__tests__/mock-provider.test.ts
import assert from "node:assert/strict";
import { createMockStorageProvider } from "../mock-provider.ts";
import { StorageNotConnectedError } from "../types.ts";

async function run() {
  const provider = createMockStorageProvider();
  assert.equal(await provider.getConnectionStatus("t1"), "connected");

  const uploaded = await provider.uploadFile("t1", {
    folderCategory: "brand_assets",
    fileName: "logo.png",
    mimeType: "image/png",
    contentBase64: Buffer.from("fake-image-bytes").toString("base64"),
  });
  assert.ok(uploaded.providerFileId);
  assert.equal(uploaded.fileName, "logo.png");

  const downloaded = await provider.downloadFile("t1", uploaded.providerFileId);
  assert.equal(Buffer.from(downloaded.contentBase64, "base64").toString("utf8"), "fake-image-bytes");

  const copy = await provider.copyFile("t1", uploaded.providerFileId, "archive");
  assert.notEqual(copy.providerFileId, uploaded.providerFileId);

  const listed = await provider.listFiles("t1");
  assert.equal(listed.length, 2); // original + copy

  const archived = await provider.listFiles("t1", "archive");
  assert.equal(archived.length, 1);
  assert.equal(archived[0].providerFileId, copy.providerFileId);

  await provider.deleteFileReference("t1", uploaded.providerFileId);
  assert.equal((await provider.listFiles("t1")).length, 1);

  const disconnected = createMockStorageProvider({ connected: false });
  await assert.rejects(
    () => disconnected.uploadFile("t1", { folderCategory: "reports", fileName: "x", mimeType: "text/plain", contentBase64: "" }),
    StorageNotConnectedError
  );

  console.log("mock-provider.test.ts (@stratxcel/storage): ALL PASS");
}

run();
