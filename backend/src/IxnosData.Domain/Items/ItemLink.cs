namespace IxnosData.Domain.Items;

// A record pointing at another one, e.g. an award naming its notice. The target is kept by
// source ID and ToItemId is filled in once that record arrives, so links to records we
// haven't ingested yet aren't lost.
public class ItemLink
{
    public long FromItemId { get; set; }

    public required string Relation { get; set; } // "notice", "award", "commitment", "amends", ...

    public required string ToSource { get; set; }

    public required string ToSourceId { get; set; }

    public long? ToItemId { get; set; }
}
