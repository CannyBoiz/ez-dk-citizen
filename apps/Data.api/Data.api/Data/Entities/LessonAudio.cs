namespace Data.api.Data.Entities;

public class LessonAudio
{
    public int Id { get; set; }
    public float AudioVersion { get; set; }
    public bool IsCurrent { get; set; }
    public DateTime CreatedAt { get; set; }
    
    public ICollection<Lesson>? Lessons { get; set; }
    public ICollection<Language>? Languages { get; set; }
}