import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, pgEnum, pgTable,
    primaryKey, text, timestamp, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

export const statusEnum = pgEnum('status', ['PENDING', 'READY', 'FAILED', 'DELETED'])
export const lessonStatusEnum = pgEnum("lesson_status", ["CURRENT", "OUTDATED", "DELETED"])


export const source = pgTable("source", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    url: text().notNull().unique(),
    publishedAt: timestamp("published_at", { precision: 6, withTimezone: true })
    .notNull(),
})

export const lesson = pgTable("lesson", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    chapter: integer().notNull(),
    version: integer().notNull(),
    status: lessonStatusEnum().notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true })
        .notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
},
    //constaint (unique, check) and PPK will be here
    (table) => [
        check("version_check", sql`${table.version} > 0`),
        unique("lesson_chapter_version_unique").on(table.chapter, table.version),
        check("lesson_chapter_check", sql`${table.chapter} > 0`)
    ]
);

export const language = pgTable("language", {
    code: varchar().primaryKey(),
    name: varchar().unique().notNull()
})

export const lessonSource = pgTable("lesson_source", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    sourceId: integer("source_id").notNull().references(
        () => source.id, { onDelete: "cascade" } // if parent row is deleted, the child row whom refer to it will be also delete
    ),
    lessonId: integer("lesson_id").notNull().references(
        () => lesson.id, { onDelete: "cascade" }
    ),
    pageFrom: integer("page_from").notNull(),
    pageTo: integer("page_to").notNull(),
},
    (table) => [
        check("lesson_source_page_from_check", sql`${table.pageFrom} > 0`),
        check("lesson_source_page_range_check", sql`${table.pageTo} >= ${table.pageFrom}`),
    ]
)

export const lessonText = pgTable("lesson_text", {
    lessonId: integer("lesson_id").notNull().references(
        () => lesson.id, { onDelete: "cascade" }
    ),
    languageCode: varchar("language_code").notNull().references(
        () => language.code, { onDelete: "restrict" } // parent can't be deleted if any child row still references it.
    ),
    title: varchar(),
    content: varchar()
},
    // composite PK
    (table) => [
        primaryKey({ columns: [table.lessonId, table.languageCode] }),
        index("lesson_text_language_code_idx").on(table.languageCode)
    ]
)


export const mediaAsset = pgTable("media_asset", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    storageProvider: varchar("storage_provider").notNull(),
    storageContainer: varchar("storage_container").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: varchar("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    durationMs: bigint("duration_ms", { mode: "bigint" }),
    status: statusEnum().notNull().default("PENDING"),
    uploadedAt: timestamp("uploaded_at", { precision: 6, withTimezone: true }).notNull()
},
    (table) => [
        unique("media_asset_storage_object_unique").on(
            table.storageProvider, table.storageContainer, table.objectKey
        ),
    ]
)

// TODO: fill up the langauge column and create unique index 
export const lessonAudio = pgTable("lesson_audio", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lessonId: integer("lesson_id").notNull().references(
        () => lesson.id, { onDelete: "cascade" }
    ),
    languageCode: varchar("language_code").notNull().references(
        () => language.code, { onDelete: "restrict" }
    ),
    audioVersion: integer().notNull(),
    isCurrent: boolean().notNull().default(false),
    createdAt: timestamp({ precision: 6, withTimezone: true, }).notNull().defaultNow(),
    mediaAssetId: integer('media_asset_id').notNull().references(
        () => mediaAsset.id, { onDelete: "restrict" }
    ).unique(), // unique bcs 1 : 1 on media asset table
},
    (table) => [
        check("version_check", sql`${table.audioVersion} > 0`),
        unique("lesson_audio_version_unique")
            .on(table.audioVersion, table.lessonId, table.languageCode),
        uniqueIndex("lesson_audio_one_current")
            .on(table.lessonId, table.languageCode)
            .where(sql`${table.isCurrent} = true`)
    ]
)
