using System.Net;
using IxnosData.Api.IntegrationTests.Fixtures;
using IxnosData.Domain.Operations;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Api.IntegrationTests.Persistence;

[Collection(PostgresTests.Name)]
public class DatabaseTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ReadinessPassesWithADatabase()
    {
        using var api = postgres.CreateApi();
        using var client = api.CreateClient();

        using var response = await client.GetAsync(new Uri("/health/ready", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GreekSearchConfigIgnoresCaseAndAccentsAndStems()
    {
        await using var db = postgres.CreateDbContext();

        var matches = await db.Database
            .SqlQuery<bool>($"""
                SELECT to_tsvector('ixnos_data_greek', 'ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ')
                       @@ websearch_to_tsquery('ixnos_data_greek', 'φάρμακα') AS "Value"
                """)
            .SingleAsync();

        Assert.True(matches);
    }

    [Fact]
    public async Task IngestionRunStatusIsStoredAsLowercaseText()
    {
        await using (var db = postgres.CreateDbContext())
        {
            db.IngestionRuns.Add(new IngestionRun
            {
                Source = "khmdhs",
                Mode = "status-test", // its own mode: other tests add hourly runs to this database
                Status = IngestionRunStatus.Succeeded,
                StartedAt = DateTimeOffset.UtcNow,
                Details = """{"notice": 12}""",
            });
            await db.SaveChangesAsync();
        }

        await using var check = postgres.CreateDbContext();
        var status = await check.Database
            .SqlQuery<string>($"""SELECT status AS "Value" FROM ingestion_run WHERE mode = 'status-test'""")
            .FirstAsync();

        Assert.Equal("succeeded", status);
    }

    [Fact]
    public async Task IngestionHealthFailsAfterTwoFailedRuns()
    {
        await using (var db = postgres.CreateDbContext())
        {
            // Dated in the future so they are the latest runs whatever other tests add.
            var later = DateTimeOffset.UtcNow.AddDays(1);
            db.IngestionRuns.AddRange(
                new IngestionRun { Source = "khmdhs", Mode = "hourly", Status = IngestionRunStatus.Failed, StartedAt = later },
                new IngestionRun { Source = "khmdhs", Mode = "hourly", Status = IngestionRunStatus.Failed, StartedAt = later.AddHours(1) });
            await db.SaveChangesAsync();
        }

        await using var api = postgres.CreateApi();
        using var client = api.CreateClient();
        using var response = await client.GetAsync(new Uri("/health/ingestion", UriKind.Relative));

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }
}
