namespace IxnosData.Application.Operations;

// The public metrics page: how much data there is, how fresh it is, and how much it is used.
// Aggregates only; nothing here identifies a user.
public sealed record PublicMetrics(
    IReadOnlyList<SourceMetrics> Sources,
    IReadOnlyList<IngestionRunSummary> RecentRuns,
    int Users,
    int SavedSearches,
    int AlertsLast7Days,
    int ApiKeys);

// LagMinutes: the median time from publication at the source to searchable here, over the last
// 7 days' new records. RunsSucceeded/RunsTotal: ingestion runs over the last 7 days.
public sealed record SourceMetrics(
    string Source,
    long Records,
    DateTimeOffset? UpdatedAt,
    double? LagMinutes,
    int RunsSucceeded,
    int RunsTotal);

public sealed record IngestionRunSummary(
    string Source,
    string Mode,
    string Status,
    DateTimeOffset StartedAt,
    double? DurationSeconds,
    int Fetched,
    int Inserted,
    int Updated);
