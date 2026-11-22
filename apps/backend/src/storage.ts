import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UploadIntentResponse } from "@ez-dk-citizen/api-contracts";

const uploadExpirySeconds = 15 * 60;
const playbackExpirySeconds = 60 * 60;

export type UploadAuthorization = Omit<UploadIntentResponse, "mediaAssetId">;

export type UploadInput = {
  key: string;
  contentType: "audio/mpeg";
  sizeBytes: number;
  // Base64 of the file's SHA-256, so S3 accepts only those exact bytes.
  checksumSha256: string;
};

// What S3 reports for an object; a field it omits stays undefined.
export type StoredObject = { contentType?: string; sizeBytes?: number };

export interface Storage {
  createUploadAuthorization(input: UploadInput): Promise<UploadAuthorization>;
  inspectObject(key: string): Promise<StoredObject>;
  createPlaybackAuthorization(key: string): Promise<{
    playbackUrl: string;
    expiresAt: string;
  }>;
  deleteObject(key: string): Promise<void>;
}

export function createS3Storage(input: {
  region: string;
  bucket: string;
}): Storage {
  const client = new S3Client({ region: input.region });
  async function authorize(
    command: PutObjectCommand | GetObjectCommand,
    seconds: number,
  ) {
    // ponytail: one credential-process call per URL; revisit caching if signing volume grows.
    const signer = new S3Client({ region: input.region });
    try {
      const credentials = await signer.config.credentials();
      const signingDate = new Date(Math.floor(Date.now() / 1_000) * 1_000);
      const expiresAt = new Date(signingDate.getTime() + seconds * 1_000);
      if (
        (credentials.sessionToken && !credentials.expiration) ||
        (credentials.expiration &&
          !(credentials.expiration.getTime() >= expiresAt.getTime()))
      ) {
        throw Object.assign(
          new Error(
            "AWS credentials cannot cover the requested URL lifetime; check the Roles Anywhere session duration.",
          ),
          { name: "CredentialLifetimeError" },
        );
      }
      return {
        url: await getSignedUrl(signer, command, {
          signingDate,
          expiresIn: seconds,
          signableHeaders: new Set([
            "content-length",
            "content-type",
            "if-none-match",
            "x-amz-checksum-sha256",
          ]),
          // S3 ignores a checksum sent in the query, so it must stay a signed header.
          unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
        }),
        expiresAt: expiresAt.toISOString(),
      };
    } finally {
      signer.destroy();
    }
  }
  return {
    async createUploadAuthorization(upload) {
      const authorization = await authorize(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: upload.key,
          ContentType: upload.contentType,
          ContentLength: upload.sizeBytes,
          IfNoneMatch: "*",
          ChecksumSHA256: upload.checksumSha256,
        }),
        uploadExpirySeconds,
      );
      return {
        uploadUrl: authorization.url,
        uploadHeaders: uploadHeaders(upload),
        expiresAt: authorization.expiresAt,
      };
    },
    async inspectObject(key) {
      const object = await client.send(
        new HeadObjectCommand({ Bucket: input.bucket, Key: key }),
      );
      return {
        contentType: object.ContentType,
        sizeBytes: object.ContentLength,
      };
    },
    async createPlaybackAuthorization(key) {
      const authorization = await authorize(
        new GetObjectCommand({ Bucket: input.bucket, Key: key }),
        playbackExpirySeconds,
      );
      return {
        playbackUrl: authorization.url,
        expiresAt: authorization.expiresAt,
      };
    },
    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: input.bucket, Key: key }),
      );
    },
  };
}

export class FakeStorage implements Storage {
  readonly uploads: UploadInput[] = [];
  readonly playbackAuthorizations: string[] = [];
  private readonly objects = new Map<string, StoredObject>();

  async createUploadAuthorization(
    input: UploadInput,
  ): Promise<UploadAuthorization> {
    this.uploads.push(input);
    return {
      uploadUrl: `https://storage.invalid/${input.key}`,
      uploadHeaders: uploadHeaders(input),
      expiresAt: expiry(uploadExpirySeconds),
    };
  }

  putObject(key: string, object: StoredObject) {
    this.objects.set(key, object);
  }

  async inspectObject(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);
    if (!object)
      throw Object.assign(new Error("S3 object was not found."), {
        name: "NotFound",
      });
    return object;
  }

  async createPlaybackAuthorization(key: string) {
    this.playbackAuthorizations.push(key);
    return {
      playbackUrl: `https://storage.invalid/${key}?playback=1`,
      expiresAt: expiry(playbackExpirySeconds),
    };
  }

  async deleteObject(key: string) {
    this.objects.delete(key);
  }
}

function uploadHeaders(upload: UploadInput) {
  return {
    "Content-Type": upload.contentType,
    "Content-Length": String(upload.sizeBytes),
    "If-None-Match": "*" as const,
    "x-amz-checksum-sha256": upload.checksumSha256,
  };
}

function expiry(seconds: number) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}
