import type {
  CompleteMediaAssetRequest,
  CreatePendingMediaAssetRequest,
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
import { touchLesson } from "../lessons/lifecycle.js";

export async function createPendingMediaAsset(
  database: DataDatabase,
  input: CreatePendingMediaAssetRequest,
) {
  const [supported] = await database
    .select({ code: language.code })
    .from(language)
    .where(eq(language.code, input.languageCode));
  if (!supported) {
    return "unsupported_language" as const;
  }

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
  return created;
}

export async function failMediaAsset(
  database: DataDatabase,
  mediaAssetId: number,
) {
  return database.transaction(async (transaction) => {
    const [asset] = await transaction
      .select({ status: mediaAsset.status })
      .from(mediaAsset)
      .where(eq(mediaAsset.id, mediaAssetId))
      .for("update");
    if (!asset) return "media_asset_not_found" as const;
    if (asset.status !== "PENDING") return "media_asset_not_pending" as const;
    await transaction
      .update(mediaAsset)
      .set({ status: "FAILED" })
      .where(eq(mediaAsset.id, mediaAssetId));
    return "failed" as const;
  });
}

export async function completeMediaAsset(
  database: DataDatabase,
  mediaAssetId: number,
  input: CompleteMediaAssetRequest,
) {
  return database.transaction(async (transaction) => {
    const [asset] = await transaction
      .select()
      .from(mediaAsset)
      .where(eq(mediaAsset.id, mediaAssetId))
      .for("update");
    if (!asset) return "media_asset_not_found" as const;
    if (asset.status === "READY") {
      const [audio] = await transaction
        .select()
        .from(lessonAudio)
        .where(eq(lessonAudio.mediaAssetId, asset.id))
        .for("update");
      if (!audio) throw new Error("Ready Media Asset has no Lesson Audio.");
      if (
        audio.lessonId === input.lessonId &&
        audio.languageCode === input.languageCode
      ) {
        return { readyAsset: asset, audio };
      }
      return "media_asset_rebind_conflict" as const;
    }
    if (asset.status === "FAILED") return "media_asset_failed" as const;
    if (asset.status !== "PENDING") return "media_asset_not_pending" as const;

    const [supported] = await transaction
      .select({ code: language.code })
      .from(language)
      .where(eq(language.code, input.languageCode));
    if (!supported) return "unsupported_language" as const;

    const [target] = await transaction
      .select({ status: lesson.status, updatedAt: lesson.updatedAt })
      .from(lesson)
      .where(eq(lesson.id, input.lessonId))
      .for("update");
    if (!target) return "lesson_not_found" as const;
    if (target.status === "ARCHIVED") return "lesson_archived" as const;

    const [text] = await transaction
      .select({ lessonId: lessonText.lessonId })
      .from(lessonText)
      .where(
        and(
          eq(lessonText.lessonId, input.lessonId),
          eq(lessonText.languageCode, input.languageCode),
        ),
      );
    if (!text) return "lesson_text_not_found" as const;

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
    return { readyAsset, audio };
  });
}
