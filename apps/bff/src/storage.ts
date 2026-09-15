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
  ): Promise<{ contentType: string; sizeBytes: number }>;
  createPlaybackAuthorization(key: string): Promise<{
    playbackUrl: string;
    expiresAt: string;
  }>;
  deleteObject(key: string): Promise<void>;
}

export function createS3Storage(input: {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Storage {
  const client = new S3Client({
    region: input.region,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
  });
  return {
    async createUploadAuthorization({ key, contentType, sizeBytes }) {
      const expiresAt = expiry(uploadExpirySeconds);
      return {
        uploadUrl: await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: input.bucket,
            Key: key,
            ContentType: contentType,
            ContentLength: sizeBytes,
            IfNoneMatch: "*",
          }),
          { expiresIn: uploadExpirySeconds },
        ),
        uploadHeaders: uploadHeaders(contentType, sizeBytes),
        expiresAt,
      };
    },
    async inspectObject(key) {
      const object = await client.send(
        new HeadObjectCommand({ Bucket: input.bucket, Key: key }),
      );
      if (
        object.ContentType === undefined ||
        object.ContentLength === undefined
      ) {
        throw new Error("S3 object metadata is incomplete.");
      }
      return {
        contentType: object.ContentType,
        sizeBytes: object.ContentLength,
      };
    },
    async createPlaybackAuthorization(key) {
      return {
        playbackUrl: await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: input.bucket, Key: key }),
          { expiresIn: playbackExpirySeconds },
        ),
        expiresAt: expiry(playbackExpirySeconds),
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

  async inspectObject(key: string) {
    const object = this.objects.get(key);
    if (!object) throw new Error("S3 object was not found.");
    return object;
  }

  async createPlaybackAuthorization(key: string) {
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
