namespace Data.api.Data.Entities;

public class Source
{
    public int Id { get; set; }
    public string? Url { get; set; }
    public DateTime PublishedAt { get; set; }
    
    public ICollection<Lesson>? Lessons { get; set; }
}