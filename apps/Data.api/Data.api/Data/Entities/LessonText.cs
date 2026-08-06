namespace Data.api.Data.Entities;

public class LessonText
{
    public int Id { get; set; }
    public string? Title { get; set; }
    public string? Content { get; set; }
    
    public ICollection<Language>? Languages { get; set; }
    public ICollection<Lesson>? Lessons { get; set; }
}