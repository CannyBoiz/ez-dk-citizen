import { defineRelations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const lessonStatus = pgEnum('lesson_status', [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
]);

export const mediaAssetStatus = pgEnum('media_asset_status', [
  'PENDING',
  'READY',
  'FAILED',
  'DELETED',
]);

export const lesson = pgTable('lesson', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    chapter: integer('chapter').notNull(),
    version: integer('version').notNull(),
    status: lessonStatus('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('lesson_chapter_positive', sql`${table.chapter} > 0`),
    check('lesson_version_positive', sql`${table.version} > 0`),
    unique('lesson_chapter_version_unique').on(table.chapter, table.version),
    uniqueIndex('lesson_one_published_per_chapter').on(table.chapter)
    .where(sql`${table.status} = 'PUBLISHED'`),
  ],
);

export const language = pgTable('language', {
  code: varchar('code', { length: 35 }).primaryKey(),
  name: text('name').notNull().unique(),
});

export const lessonText = pgTable(
  'lesson_text',
  {
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lesson.id, { onDelete: 'cascade' }),
    languageCode: varchar('language_code', { length: 35 })
      .notNull()
      .references(() => language.code, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'lesson_text_pkey',
      columns: [table.lessonId, table.languageCode],
    }),
    check('lesson_text_title_non_blank', sql`length(btrim(${table.title})) > 0`),
    check('lesson_text_content_non_blank',sql`length(btrim(${table.content})) > 0`),
  ],
);

export const source = pgTable('source', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  url: text('url').notNull().unique(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export const lessonSource = pgTable(
  'lesson_source',
  {
    lessonId: integer('lesson_id').notNull().references(
      () => lesson.id, { onDelete: 'cascade' }
    ),
    sourceId: integer('source_id').notNull().references(
      () => source.id, { onDelete: 'cascade' }
    ),
    pageFrom: integer('page_from'),
    pageTo: integer('page_to'),
    sectionReference: text('section_reference'),
  },
  (table) => [
    primaryKey({
      name: 'lesson_source_pkey',
      columns: [table.lessonId, table.sourceId],
    }),
    check(
      'lesson_source_page_from_positive',
      sql`${table.pageFrom} is null or ${table.pageFrom} > 0`,
    ),
    check(
      'lesson_source_page_to_positive',
      sql`${table.pageTo} is null or ${table.pageTo} > 0`,
    ),
    check(
      'lesson_source_page_range_ordered',
      sql`${table.pageFrom} is null or ${table.pageTo} is null or ${table.pageTo} >= ${table.pageFrom}`,
    ),
  ],
);

export const mediaAsset = pgTable(
  'media_asset',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    storageProvider: text('storage_provider').notNull(),
    storageContainer: text('storage_container').notNull(),
    objectKey: text('object_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    durationMs: bigint('duration_ms', { mode: 'bigint' }),
    status: mediaAssetStatus('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  },
  (table) => [
    unique('media_asset_storage_object_unique').on(
      table.storageProvider,table.storageContainer,table.objectKey,
    ),
    check('media_asset_size_bytes_positive', sql`${table.sizeBytes} > 0`),
    check('media_asset_duration_ms_positive',
      sql`${table.durationMs} is null or ${table.durationMs} > 0`,
    ),
    check('media_asset_content_type_non_blank',
      sql`length(btrim(${table.contentType})) > 0`,
    ),
  ],
);

export const lessonAudio = pgTable(
  'lesson_audio',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    lessonId: integer('lesson_id').notNull().references(
      () => lesson.id, { onDelete: 'cascade' } // if the child row is deleted, parent will deleted aswell
    ),
    languageCode: varchar('language_code', { length: 35 }).notNull().references(
      () => language.code, { onDelete: 'restrict' }
    ),
    mediaAssetId: integer('media_asset_id').notNull().references(
      () => mediaAsset.id, { onDelete: 'restrict' }
    ).unique(),
    audioVersion: integer('audio_version').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'lesson_audio_lesson_text_fk',
      columns: [table.lessonId, table.languageCode],
      foreignColumns: [lessonText.lessonId, lessonText.languageCode],
    }),
    check('lesson_audio_version_positive', sql`${table.audioVersion} > 0`),
    unique('lesson_audio_version_unique').on(
      table.lessonId, table.languageCode, table.audioVersion,
    ),
    uniqueIndex('lesson_audio_one_current')
      .on(table.lessonId, table.languageCode).where(sql`${table.isCurrent} = true`),
  ],
);

export const schema = {
  lesson, language, lessonText, source, lessonSource, mediaAsset, lessonAudio
};

// set the relations between tables
// `from` is PK from its table, while `to` will usually be the FK for the other talbe
export const schemaRelations = defineRelations(schema, (relations) => ({
  // 1 : M - use `.many`
  // 1 : 1 - use `.one` AND set the `optional` to false
  lesson: {
    texts: relations.many.lessonText({
      from: relations.lesson.id,
      to: relations.lessonText.lessonId,
    }),
    sources: relations.many.lessonSource({
      from: relations.lesson.id,
      to: relations.lessonSource.lessonId,
    }),
    audio: relations.many.lessonAudio({
      from: relations.lesson.id,
      to: relations.lessonAudio.lessonId,
    }),
  },
  language: {
    lessonTexts: relations.many.lessonText({
      from: relations.language.code,
      to: relations.lessonText.languageCode,
    }),
    lessonAudio: relations.many.lessonAudio({
      from: relations.language.code,
      to: relations.lessonAudio.languageCode,
    }),
  },
  lessonText: {
    lesson: relations.one.lesson({
      from: relations.lessonText.lessonId,
      to: relations.lesson.id,
      optional: false,
    }),
    language: relations.one.language({
      from: relations.lessonText.languageCode,
      to: relations.language.code,
      optional: false,
    }),
    audio: relations.many.lessonAudio({
      from: [relations.lessonText.lessonId, relations.lessonText.languageCode],
      to: [relations.lessonAudio.lessonId, relations.lessonAudio.languageCode],
    }),
  },
  source: {
    lessons: relations.many.lessonSource({
      from: relations.source.id,
      to: relations.lessonSource.sourceId,
    }),
  },
  lessonSource: {
    lesson: relations.one.lesson({
      from: relations.lessonSource.lessonId,
      to: relations.lesson.id,
      optional: false,
    }),
    source: relations.one.source({
      from: relations.lessonSource.sourceId,
      to: relations.source.id,
      optional: false,
    }),
  },
  mediaAsset: {
    lessonAudio: relations.one.lessonAudio({
      from: relations.mediaAsset.id,
      to: relations.lessonAudio.mediaAssetId,
      optional: true,
    }),
  },
  lessonAudio: {
    lesson: relations.one.lesson({
      from: relations.lessonAudio.lessonId,
      to: relations.lesson.id,
      optional: false,
    }),
    language: relations.one.language({
      from: relations.lessonAudio.languageCode,
      to: relations.language.code,
      optional: false,
    }),
    lessonText: relations.one.lessonText({
      from: [relations.lessonAudio.lessonId, relations.lessonAudio.languageCode],
      to: [relations.lessonText.lessonId, relations.lessonText.languageCode],
      optional: false,
    }),
    mediaAsset: relations.one.mediaAsset({
      from: relations.lessonAudio.mediaAssetId,
      to: relations.mediaAsset.id,
      optional: false,
    }),
  },
}));
