import type {
  CompleteMediaAssetRequest,
  CreateUploadIntentRequest,
} from "@ez-dk-citizen/api-contracts";
import { and, desc, eq } from "drizzle-orm";

import type { DataDatabase } from "../../db/database.js";
import {
  language,
  lesson,
  lessonAudio,
  lessonText,
  mediaAsset,
} from "../../db/schema.js";
import { fail, ok } from "../../outcome.js";
import { touchLesson } from "../lessons/lifecycle.js";

// What the Backend records for an Upload Intent before the object is uploaded.
export type PendingMediaAsset = Pick<
  CreateUploadIntentRequest,
  "languageCode" | "originalFilename" | "contentType" | "sizeBytes"
> & { storageProvider: "s3"; storageContainer: string; objectKey: string };

export async function createPendingMediaAsset(
  database: DataDatabase,
  input: PendingMediaAsset,
) {
  const [supported] = await database
    .select({ code: language.code })
    .from(language)
    .where(eq(language.code, input.languageCode));
  if (!supported) return fail("unsupported_language");

  const [created] = await database
    .insert(mediaAsset)
    .values({
      storageProvider: input.storageProvider,
      storageContainer: input.storageContainer,
      objectKey: input.objectKey,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      sizeBytes: BigInt(input.sizeBytes),
      status: "PENDING",
      durationMs: null,
      uploadedAt: null,
    })
    .returning();
  if (!created) throw new Error("Media Asset insert returned no row.");
  return ok(created);
}

// What Storage found under a Media Asset's object key.
export type StoredObject = { contentType?: string; sizeBytes?: number };

export async function completeMediaAsset(
  database: DataDatabase,
  mediaAssetId: number,
  input: CompleteMediaAssetRequest,
  storedObject?: StoredObject,
) {
  return database.transaction(async (transaction) => {
    const [asset] = await transaction
      .select()
      .from(mediaAsset)
      .where(eq(mediaAsset.id, mediaAssetId))
      .for("update");
    if (!asset) return fail("media_asset_not_found");
    // A retry answers the Lesson Audio the asset already backs in the requested Lesson and
    // Language. A new version may share the asset (ADR-0008), but completion never adds one.
    if (asset.status === "READY") {
      const [audio] = await transaction
        .select()
        .from(lessonAudio)
        .where(
          and(
            eq(lessonAudio.mediaAssetId, asset.id),
            eq(lessonAudio.lessonId, input.lessonId),
            eq(lessonAudio.languageCode, input.languageCode),
          ),
        )
        .for("update");
      return audio
        ? ok({ readyAsset: asset, audio })
        : fail("media_asset_rebind_conflict");
    }
    if (asset.status === "FAILED") return fail("media_asset_failed");
    if (asset.status !== "PENDING") return fail("media_asset_not_pending");

    // A mismatched upload fails for good, even when its target is also refused.
    if (!storedObject) {
      throw new Error(
        "A pending Media Asset completes only with its stored object.",
      );
    }
    if (
      storedObject.contentType !== asset.contentType ||
      storedObject.sizeBytes !== Number(asset.sizeBytes)
    ) {
      await transaction
        .update(mediaAsset)
        .set({ status: "FAILED" })
        .where(eq(mediaAsset.id, asset.id));
      return fail("invalid_uploaded_media");
    }

    const [supported] = await transaction
      .select({ code: language.code })
      .from(language)
      .where(eq(language.code, input.languageCode));
    if (!supported) return fail("unsupported_language");

    const [target] = await transaction
      .select({ status: lesson.status, updatedAt: lesson.updatedAt })
      .from(lesson)
      .where(eq(lesson.id, input.lessonId))
      .for("update");
    if (!target) return fail("lesson_not_found");
    if (target.status === "ARCHIVED") return fail("lesson_archived");

    const [text] = await transaction
      .select({ lessonId: lessonText.lessonId })
      .from(lessonText)
      .where(
        and(
          eq(lessonText.lessonId, input.lessonId),
          eq(lessonText.languageCode, input.languageCode),
        ),
      );
    if (!text) return fail("lesson_text_not_found");

    const now = new Date();
    const [latestAudio] = await transaction
      .select({ audioVersion: lessonAudio.audioVersion })
      .from(lessonAudio)
      .where(
        and(
          eq(lessonAudio.lessonId, input.lessonId),
          eq(lessonAudio.languageCode, input.languageCode),
        ),
      )
      .orderBy(desc(lessonAudio.audioVersion))
      .limit(1);
    await transaction
      .update(lessonAudio)
      .set({ isCurrent: false })
      .where(
        and(
          eq(lessonAudio.lessonId, input.lessonId),
          eq(lessonAudio.languageCode, input.languageCode),
          eq(lessonAudio.isCurrent, true),
        ),
      );
    const [readyAsset] = await transaction
      .update(mediaAsset)
      .set({ status: "READY", uploadedAt: now })
      .where(eq(mediaAsset.id, asset.id))
      .returning();
    if (!readyAsset) throw new Error("Media Asset update returned no row.");
    const [audio] = await transaction
      .insert(lessonAudio)
      .values({
        lessonId: input.lessonId,
        languageCode: input.languageCode,
        mediaAssetId: asset.id,
        audioVersion: (latestAudio?.audioVersion ?? 0) + 1,
        isCurrent: true,
      })
      .returning();
    if (!audio) throw new Error("Lesson Audio insert returned no row.");
    await touchLesson(transaction, input.lessonId, target.updatedAt);
    return ok({ readyAsset, audio });
  });
}
