using IxnosData.Application.Abstractions;
using IxnosData.Domain.Alerts;
using IxnosData.Domain.Contractors;
using IxnosData.Domain.Items;
using IxnosData.Domain.Operations;
using IxnosData.Domain.Organisations;
using IxnosData.Domain.Reference;
using IxnosData.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Infrastructure.Persistence;

// Migrations here are the only place the schema changes. The pipeline writes rows but never alters
// tables.
public class IxnosDataDbContext(DbContextOptions<IxnosDataDbContext> options) : DbContext(options), IAccountsDbContext
{
    public DbSet<IngestionRun> IngestionRuns => Set<IngestionRun>();

    public DbSet<CpvCode> CpvCodes => Set<CpvCode>();

    public DbSet<NutsRegion> NutsRegions => Set<NutsRegion>();

    public DbSet<Organisation> Organisations => Set<Organisation>();

    public DbSet<ProcurementItem> ProcurementItems => Set<ProcurementItem>();

    public DbSet<ItemLink> ItemLinks => Set<ItemLink>();

    public DbSet<Contractor> Contractors => Set<Contractor>();

    public DbSet<ItemContractor> ItemContractors => Set<ItemContractor>();

    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();

    public DbSet<LoginToken> LoginTokens => Set<LoginToken>();

    public DbSet<UserSession> UserSessions => Set<UserSession>();

    public DbSet<SavedSearch> SavedSearches => Set<SavedSearch>();

    public DbSet<AlertDelivery> AlertDeliveries => Set<AlertDelivery>();

    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();

    public static void Configure(DbContextOptionsBuilder options, string connectionString) =>
        options
            .UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
            .UseSnakeCaseNamingConvention();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("unaccent");
        modelBuilder.HasPostgresExtension("pg_trgm");

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(IxnosDataDbContext).Assembly);
    }
}
