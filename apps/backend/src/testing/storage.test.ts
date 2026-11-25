import assert from "node:assert/strict";
import { test } from "node:test";

import { createFakeStorage } from "./storage.ts";

test("the fake storage rejects every operation the test did not supply", async () => {
  const storage = createFakeStorage({ async deleteObject() {} });

  await storage.deleteObject("audio/kept.mp3");
  await assert.rejects(storage.inspectObject("audio/any.mp3"), /not used/);
  await assert.rejects(
    storage.createPlaybackAuthorization("audio/any.mp3"),
    /not used/,
  );
  await assert.rejects(
    storage.createUploadAuthorization({
      key: "audio/any.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
      checksumSha256: "",
    }),
    /not used/,
  );
});
