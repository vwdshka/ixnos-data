using Dapper;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Accounts;
using IxnosData.Infrastructure.Email;
using IxnosData.Infrastructure.Operations;
using IxnosData.Infrastructure.Persistence;
using IxnosData.Infrastructure.Persistence.Queries;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace IxnosData.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        // Dapper maps snake_case columns (source_id) to PascalCase properties (SourceId).
        DefaultTypeMap.MatchNamesWithUnderscores = true;

        // The connection string is read when first needed, not at startup, so tools that start
        // the app without a database (build-time OpenAPI generation) work.
        services.AddDbContext<IxnosDataDbContext>((provider, options) =>
            IxnosDataDbContext.Configure(options, ConnectionString(provider)));
        // Reads (search, record and organisation pages) give up after 15 seconds, so a flood of
        // expensive searches can't hold every connection. EF Core (migrations, account writes)
        // opens its own connections without this limit.
        services.AddSingleton(provider =>
        {
            var builder = new NpgsqlDataSourceBuilder(ConnectionString(provider));
            builder.ConnectionStringBuilder.Options = "-c statement_timeout=15000";
            return builder.Build();
        });
        services.AddMemoryCache();

        services.AddScoped<IItemQueries, ItemQueries>();
        services.AddScoped<IOrganisationQueries, OrganisationQueries>();
        services.AddScoped<ISitemapQueries, SitemapQueries>();
        services.AddScoped<IReferenceQueries, ReferenceQueries>();
        services.AddScoped<IStatusQueries, StatusQueries>();
        services.AddScoped<IAccountsDbContext>(provider => provider.GetRequiredService<IxnosDataDbContext>());
        services.AddSingleton<IEmailSender, SmtpEmailSender>();
        // Links in emails point at the web app (IXNOS_DATA_Web__BaseUrl).
        services.AddSingleton(provider => new WebLinks(new Uri(
            provider.GetRequiredService<IConfiguration>()["Web:BaseUrl"] ?? "http://localhost:3000")));

        services.AddSingleton(TimeProvider.System);
        services.AddHealthChecks()
            .AddDbContextCheck<IxnosDataDbContext>("database", tags: ["ready"])
            .AddCheck<IngestionHealthCheck>("ingestion", tags: ["ingestion"]);

        return services;
    }

    private static string ConnectionString(IServiceProvider provider) =>
        provider.GetRequiredService<IConfiguration>().GetConnectionString("IxnosData")
        ?? throw new InvalidOperationException(
            "Connection string 'IxnosData' is missing. Set IXNOS_DATA_ConnectionStrings__IxnosData.");
}
