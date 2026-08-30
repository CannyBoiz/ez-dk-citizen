CREATE TYPE "lesson_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "media_asset_status" AS ENUM('PENDING', 'READY', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TABLE "language" (
	"code" varchar(35) PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chapter" integer NOT NULL,
	"version" integer NOT NULL,
	"status" "lesson_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_chapter_version_unique" UNIQUE("chapter","version"),
	CONSTRAINT "lesson_chapter_positive" CHECK ("chapter" > 0),
	CONSTRAINT "lesson_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_audio" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_audio_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lesson_id" integer NOT NULL,
	"language_code" varchar(35) NOT NULL,
	"media_asset_id" integer NOT NULL UNIQUE,
	"audio_version" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_audio_version_unique" UNIQUE("lesson_id","language_code","audio_version"),
	CONSTRAINT "lesson_audio_version_positive" CHECK ("audio_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_source" (
	"lesson_id" integer,
	"source_id" integer,
	"page_from" integer,
	"page_to" integer,
	"section_reference" text,
	CONSTRAINT "lesson_source_pkey" PRIMARY KEY("lesson_id","source_id"),
	CONSTRAINT "lesson_source_page_from_positive" CHECK ("page_from" is null or "page_from" > 0),
	CONSTRAINT "lesson_source_page_to_positive" CHECK ("page_to" is null or "page_to" > 0),
	CONSTRAINT "lesson_source_page_range_ordered" CHECK ("page_from" is null or "page_to" is null or "page_to" >= "page_from")
);
--> statement-breakpoint
CREATE TABLE "lesson_text" (
	"lesson_id" integer,
	"language_code" varchar(35),
	"title" text NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "lesson_text_pkey" PRIMARY KEY("lesson_id","language_code"),
	CONSTRAINT "lesson_text_title_non_blank" CHECK (length(btrim("title")) > 0),
	CONSTRAINT "lesson_text_content_non_blank" CHECK (length(btrim("content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "media_asset" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_asset_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"storage_provider" text NOT NULL,
	"storage_container" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_ms" bigint,
	"status" "media_asset_status" DEFAULT 'PENDING'::"media_asset_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	CONSTRAINT "media_asset_storage_object_unique" UNIQUE("storage_provider","storage_container","object_key"),
	CONSTRAINT "media_asset_size_bytes_positive" CHECK ("size_bytes" > 0),
	CONSTRAINT "media_asset_duration_ms_positive" CHECK ("duration_ms" is null or "duration_ms" > 0),
	CONSTRAINT "media_asset_content_type_non_blank" CHECK (length(btrim("content_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL UNIQUE,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_one_published_per_chapter" ON "lesson" ("chapter") WHERE "status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_audio_one_current" ON "lesson_audio" ("lesson_id","language_code") WHERE "is_current" = true;--> statement-breakpoint
ALTER TABLE "lesson_audio" ADD CONSTRAINT "lesson_audio_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_audio" ADD CONSTRAINT "lesson_audio_language_code_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "language"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "lesson_audio" ADD CONSTRAINT "lesson_audio_media_asset_id_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "lesson_audio" ADD CONSTRAINT "lesson_audio_lesson_text_fk" FOREIGN KEY ("lesson_id","language_code") REFERENCES "lesson_text"("lesson_id","language_code");--> statement-breakpoint
ALTER TABLE "lesson_source" ADD CONSTRAINT "lesson_source_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_source" ADD CONSTRAINT "lesson_source_source_id_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_text" ADD CONSTRAINT "lesson_text_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_text" ADD CONSTRAINT "lesson_text_language_code_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "language"("code") ON DELETE RESTRICT;--> statement-breakpoint
INSERT INTO "language" ("code", "name") VALUES
	('da', 'Danish'),
	('en', 'English'),
	('th', 'Thai');
