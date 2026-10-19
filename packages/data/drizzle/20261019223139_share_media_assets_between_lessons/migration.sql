-- A new version shares its source's Media Assets (ADR-0008): one Media Asset may back
-- Lesson Audio in several Lessons, but only once in each Lesson and Language.
ALTER TABLE "lesson_audio" DROP CONSTRAINT "lesson_audio_media_asset_id_key";--> statement-breakpoint
ALTER TABLE "lesson_audio" ADD CONSTRAINT "lesson_audio_media_asset_unique" UNIQUE("lesson_id","language_code","media_asset_id");