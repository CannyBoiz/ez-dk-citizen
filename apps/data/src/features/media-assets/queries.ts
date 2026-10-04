import { eq } from "drizzle-orm";

import type { DataDatabase } from "../../db/database.js";
import { mediaAsset } from "../../db/schema.js";

export async function findMediaAsset(
  database: DataDatabase,
  mediaAssetId: number,
) {
  const [asset] = await database
    .select()
    .from(mediaAsset)
    .where(eq(mediaAsset.id, mediaAssetId));
  return asset;
}
