import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const uploadExpirySeconds = 15 * 60;
const playbackExpirySeconds = 60 * 60;

export type UploadAuthorization = {
  uploadUrl: string;
  uploadHeaders: {
    "Content-Type": "audio/mpeg";
    "Content-Length": string;
    "If-None-Match": "*";
  };
  expiresAt: string;
};

export interface Storage {
  createUploadAuthorization(input: {
    key: string;
    contentType: "audio/mpeg";
    sizeBytes: number;
  }): Promise<UploadAuthorization>;
  inspectObject(
    key: string,
  ): Promise<{ contentType?: string; sizeBytes?: number }>;
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
          ]),
        }),
        expiresAt: expiresAt.toISOString(),
      };
    } finally {
      signer.destroy();
    }
  }
  return {
    async createUploadAuthorization({ key, contentType, sizeBytes }) {
      const authorization = await authorize(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: sizeBytes,
          IfNoneMatch: "*",
        }),
        uploadExpirySeconds,
      );
      return {
        uploadUrl: authorization.url,
        uploadHeaders: uploadHeaders(contentType, sizeBytes),
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
  readonly uploads: Array<{
    key: string;
    contentType: "audio/mpeg";
    sizeBytes: number;
  }> = [];
  readonly playbackAuthorizations: string[] = [];
  private readonly objects = new Map<
    string,
    { contentType: string; sizeBytes: number }
  >();

  async createUploadAuthorization(input: {
    key: string;
    contentType: "audio/mpeg";
    sizeBytes: number;
  }): Promise<UploadAuthorization> {
    this.uploads.push(input);
    return {
      uploadUrl: `https://storage.invalid/${input.key}`,
      uploadHeaders: uploadHeaders(input.contentType, input.sizeBytes),
      expiresAt: expiry(uploadExpirySeconds),
    };
  }

  putObject(key: string, object: { contentType: string; sizeBytes: number }) {
    this.objects.set(key, object);
  }

  async inspectObject(
    key: string,
  ): Promise<{ contentType?: string; sizeBytes?: number }> {
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

function uploadHeaders(contentType: "audio/mpeg", sizeBytes: number) {
  return {
    "Content-Type": contentType,
    "Content-Length": String(sizeBytes),
    "If-None-Match": "*" as const,
  };
}

function expiry(seconds: number) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}
