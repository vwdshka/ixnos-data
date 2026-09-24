using IxnosData.Domain.Operations;
using IxnosData.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace IxnosData.Infrastructure.Operations;

// Unhealthy when a source's last two runs failed or it has added nothing for 24 hours. The uptime
// monitor polls this.
public sealed class IngestionHealthCheck(IxnosDataDbContext db, TimeProvider clock) : IHealthCheck
{
    private static readonly string[] Sources = ["khmdhs", "diavgeia"];

    public static readonly TimeSpan MaxQuiet = TimeSpan.FromHours(24);

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var problems = new List<string>();
        foreach (var source in Sources)
        {
            var lastTwo = await db.IngestionRuns
                .Where(r => r.Source == source && r.Status != IngestionRunStatus.Running)
                .OrderByDescending(r => r.StartedAt)
                .Take(2)
                .Select(r => r.Status)
                .ToListAsync(cancellationToken);
            if (lastTwo.Count == 2 && lastTwo.All(s => s == IngestionRunStatus.Failed))
            {
                problems.Add($"{source}: the last two runs failed");
            }

            var lastNew = await db.IngestionRuns
                .Where(r => r.Source == source && r.Status == IngestionRunStatus.Succeeded && r.Inserted > 0)
                .MaxAsync(r => (DateTimeOffset?)r.StartedAt, cancellationToken);
            if (lastNew is null || clock.GetUtcNow() - lastNew > MaxQuiet)
            {
                problems.Add($"{source}: no new records for {MaxQuiet.TotalHours:0} hours");
            }
        }

        return problems.Count == 0 ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy(string.Join("; ", problems));
    }
}
