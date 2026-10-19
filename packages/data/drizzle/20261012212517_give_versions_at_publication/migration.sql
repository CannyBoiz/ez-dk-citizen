ALTER TABLE "lesson" ADD COLUMN "version_patch" integer;--> statement-breakpoint
ALTER TABLE "lesson" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- Publication now gives the version: existing versions N become N.0, including on Lessons
-- archived as Drafts, and Drafts lose theirs.
UPDATE "lesson" SET "version_patch" = 0 WHERE "status" <> 'DRAFT';--> statement-breakpoint
UPDATE "lesson" SET "version" = NULL WHERE "status" = 'DRAFT';--> statement-breakpoint
ALTER TABLE "lesson" DROP CONSTRAINT "lesson_chapter_version_unique";--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_chapter_version_unique" UNIQUE("chapter","version","version_patch");--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_version_patch_non_negative" CHECK ("version_patch" >= 0);--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_version_whole" CHECK (("version" is null) = ("version_patch" is null));--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_version_absent_exactly_on_draft" CHECK (("version" is null) = ("status" = 'DRAFT'));