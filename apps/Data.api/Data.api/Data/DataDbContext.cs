using Data.api.Data.Entities;
using Data.api.Data.Enums;
using Microsoft.EntityFrameworkCore;

namespace Data.api.Data;

public class DataDbContext(DbContextOptions<DataDbContext> options): DbContext(options)
{
    public DbSet<Language> Languages => Set<Language>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<LessonAudio> LessonAudios => Set<LessonAudio>();
    public DbSet<LessonText> LessonTexts => Set<LessonText>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<Source> Sources => Set<Source>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // set schema
        modelBuilder.HasDefaultSchema("ez_dk_citizen");

        // tell EFCore that these enum should be on the set schema
        modelBuilder.HasPostgresEnum<LessonStatus>("ez_dk_citizen", "lesson_status");
        modelBuilder.HasPostgresEnum<MediaStatus>("ez_dk_citizen", "media_status");
        modelBuilder.HasPostgresEnum<StorageProviderType>("ez_dk_citizen", "storage_provider");
        
        //todo : complete the entity setup
        
        base.OnModelCreating(modelBuilder);
    }
}