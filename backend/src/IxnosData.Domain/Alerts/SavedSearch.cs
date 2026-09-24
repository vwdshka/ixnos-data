namespace IxnosData.Domain.Alerts;

public class SavedSearch
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public required string Name { get; set; }

    public string? Query { get; set; }

    public string? Kind { get; set; }

    public string? Cpv { get; set; }

    public string? Nuts { get; set; }

    public decimal? MinAmount { get; set; }

    public decimal? MaxAmount { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    // The digest only looks at records ingested after this.
    public DateTimeOffset CheckedUpTo { get; set; }
}

// Written before the email is sent: a crash can skip a record but never send it twice.
public class AlertDelivery
{
    public Guid SavedSearchId { get; set; }

    public required string ItemSourceId { get; set; }

    public DateTimeOffset SentAt { get; set; }
}
