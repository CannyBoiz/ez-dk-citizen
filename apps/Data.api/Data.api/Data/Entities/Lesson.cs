using Data.api.Data.Enums;

namespace Data.api.Data.Entities;

public class Lesson
{
    public int Id { get; set; }
    public string? Chapter { get; set; }
    public float Version { get; set; }
    public LessonStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}