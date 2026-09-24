namespace IxnosData.Domain.Operations;

// Written by the Python pipeline, one row per run.
public class IngestionRun
{
    public long Id { get; set; }

    public required string Source { get; set; }

    public required string Mode { get; set; } // hourly, nightly, backfill, seed

    public IngestionRunStatus Status { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    public int Fetched { get; set; }

    public int Inserted { get; set; }

    public int Updated { get; set; }

    public int Errors { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Details { get; set; } // JSON
}

public enum IngestionRunStatus
{
    Running,
    Succeeded,
    Failed,
}
