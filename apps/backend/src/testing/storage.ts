import type {
  Storage,
  StoredObject,
  UploadAuthorization,
  UploadInput,
} from "../storage.ts";

// Every operation rejects unless the test overrides it, so a route that calls
// something the test didn't expect fails loudly instead of returning undefined.
export function createFakeStorage(overrides: Partial<Storage> = {}): Storage {
  return new Proxy(overrides as Storage, {
    get: (target, name) =>
      Reflect.get(target, name) ??
      (() => Promise.reject(new Error("not used"))),
  });
}

// Signs nothing; the URL names the key, so a test can tell which object it grants.
export async function fakeUploadAuthorization(
  input: UploadInput,
): Promise<UploadAuthorization> {
  return {
    uploadUrl: `https://storage.invalid/${input.key}`,
    uploadHeaders: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.sizeBytes),
      "If-None-Match": "*",
      "x-amz-checksum-sha256": input.checksumSha256,
    },
    expiresAt: new Date(Date.now() + 15 * 60 * 1_000).toISOString(),
  };
}

export async function fakePlaybackAuthorization(key: string) {
  return {
    playbackUrl: `https://storage.invalid/${key}?playback=1`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
  };
}

// An in-memory bucket, for a test where one call stores an object and a later
// call reads it. `put` stands in for the browser's direct upload.
export function createFakeBucket() {
  const objects = new Map<string, StoredObject>();
  return {
    put(key: string, object: StoredObject) {
      objects.set(key, object);
    },
    has: (key: string) => objects.has(key),
    async inspectObject(key: string): Promise<StoredObject> {
      const object = objects.get(key);
      if (!object)
        throw Object.assign(new Error("S3 object was not found."), {
          name: "NotFound",
        });
      return object;
    },
    async deleteObject(key: string) {
      objects.delete(key);
    },
  };
}
