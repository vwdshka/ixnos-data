namespace IxnosData.Application.Operations;

// UpdatedAt is the most recent successful ingestion run, whichever source it was.
public sealed record DataStatus(DateTimeOffset? UpdatedAt, IReadOnlyList<SourceStatus> Sources);

public sealed record SourceStatus(string Source, DateTimeOffset? UpdatedAt);
