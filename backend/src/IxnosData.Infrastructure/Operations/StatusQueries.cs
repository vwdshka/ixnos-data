using Dapper;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Operations;
using IxnosData.Infrastructure.Persistence.Queries;
using Npgsql;

namespace IxnosData.Infrastructure.Operations;

public sealed class StatusQueries(NpgsqlDataSource dataSource) : IStatusQueries
{
    public async Task<DataStatus> GetAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<(string Source, DateTime FinishedAt)>(new CommandDefinition(
            """
            SELECT source, max(finished_at) FROM ingestion_run
            WHERE status = 'succeeded' AND finished_at IS NOT NULL
            GROUP BY source ORDER BY source
            """,
            cancellationToken: cancellationToken));
        var sources = rows.Select(row => new SourceStatus(row.Source, ItemQueries.Utc(row.FinishedAt))).ToList();
        return new DataStatus(sources.Max(s => s.UpdatedAt), sources);
    }

    public async Task<PublicMetrics> GetMetricsAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        using var results = await connection.QueryMultipleAsync(new CommandDefinition(
            """
            WITH records AS (
                SELECT source, count(*) AS records,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ingested_at - published_at) / 60)
                           FILTER (WHERE ingested_at >= now() - interval '7 days'
                                     AND published_at >= now() - interval '7 days'
                                     AND ingested_at >= published_at) AS lag_minutes
                FROM procurement_item GROUP BY source),
            runs AS (
                SELECT source, max(finished_at) FILTER (WHERE status = 'succeeded') AS updated_at,
                       count(*) FILTER (WHERE status = 'succeeded' AND started_at >= now() - interval '7 days')::int AS succeeded,
                       count(*) FILTER (WHERE started_at >= now() - interval '7 days')::int AS total
                FROM ingestion_run GROUP BY source)
            SELECT coalesce(r.source, u.source) AS "Source", coalesce(r.records, 0) AS "Records",
                   u.updated_at AS "UpdatedAt", r.lag_minutes AS "LagMinutes",
                   coalesce(u.succeeded, 0) AS "RunsSucceeded", coalesce(u.total, 0) AS "RunsTotal"
            FROM records r FULL JOIN runs u ON u.source = r.source
            ORDER BY 1;

            SELECT source AS "Source", mode AS "Mode", status AS "Status", started_at AS "StartedAt",
                   extract(epoch FROM finished_at - started_at)::float8 AS "DurationSeconds",
                   fetched AS "Fetched", inserted AS "Inserted", updated AS "Updated"
            FROM ingestion_run ORDER BY started_at DESC LIMIT 10;

            SELECT (SELECT count(*) FROM user_account)::int,
                   (SELECT count(*) FROM saved_search)::int,
                   (SELECT count(*) FROM alert_delivery WHERE sent_at >= now() - interval '7 days')::int,
                   (SELECT count(*) FROM api_key WHERE revoked_at IS NULL)::int;
            """,
            cancellationToken: cancellationToken));
        var sources = (await results.ReadAsync<SourceRow>()).Select(row => row.ToMetrics()).ToList();
        var runs = (await results.ReadAsync<RunRow>()).Select(row => row.ToSummary()).ToList();
        var usage = await results.ReadSingleAsync<(int Users, int SavedSearches, int Alerts, int ApiKeys)>();
        return new PublicMetrics(sources, runs, usage.Users, usage.SavedSearches, usage.Alerts, usage.ApiKeys);
    }

    // Npgsql reads timestamptz as a UTC DateTime; the API returns DateTimeOffset.
    private sealed record SourceRow(string Source, long Records, DateTime? UpdatedAt, double? LagMinutes, int RunsSucceeded, int RunsTotal)
    {
        public SourceMetrics ToMetrics() => new(
            Source, Records, UpdatedAt is { } at ? ItemQueries.Utc(at) : null,
            LagMinutes is { } lag ? Math.Round(lag, 1) : null, RunsSucceeded, RunsTotal);
    }

    private sealed record RunRow(string Source, string Mode, string Status, DateTime StartedAt, double? DurationSeconds, int Fetched, int Inserted, int Updated)
    {
        public IngestionRunSummary ToSummary() => new(
            Source, Mode, Status, ItemQueries.Utc(StartedAt),
            DurationSeconds is { } seconds ? Math.Round(seconds, 1) : null, Fetched, Inserted, Updated);
    }
}
