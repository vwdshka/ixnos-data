using IxnosData.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace IxnosData.Api.IntegrationTests.Fixtures;

/// <summary>
/// One throwaway PostgreSQL (same major version as production) per test run, migrated with
/// the real EF Core migrations. Needs Docker.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:16-alpine").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var db = CreateDbContext();
        await db.Database.MigrateAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    public IxnosDataDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<IxnosDataDbContext>();
        IxnosDataDbContext.Configure(options, ConnectionString);
        return new IxnosDataDbContext(options.Options);
    }

    public WebApplicationFactory<Program> CreateApi() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
            host.UseSetting("ConnectionStrings:IxnosData", ConnectionString));
}

[CollectionDefinition(Name)]
public sealed class PostgresTests : ICollectionFixture<PostgresFixture>
{
    public const string Name = "postgres";
}
