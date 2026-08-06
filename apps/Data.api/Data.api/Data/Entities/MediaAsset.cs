using System.Numerics;
using Data.api.Data.Enums;

namespace Data.api.Data.Entities;

public class MediaAsset
{
    public int Id { get; set; }
    public StorageProviderType StorageProvider { get; set; }
    public string? StorageContainer { get; set; }
    public string? ObjectKey { get; set; }
    public string? OriginalFileName { get; set; }
    public string? ContentType { get; set; }
    public int SizeKb { get; set; }
    public float DurationMs { get; set; }
    public MediaStatus Status { get; set; }
    public DateTime UploadedAt { get; set; }
    
    // FK 
    public LessonAudio? LessonAudio { get; set; }
}