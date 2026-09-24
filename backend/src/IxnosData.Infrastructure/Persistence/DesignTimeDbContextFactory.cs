using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace IxnosData.Infrastructure.Persistence;

// For dotnet-ef only. Falls back to the local compose database.
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<IxnosDataDbContext>
{
    private const string LocalDefault =
        "Host=localhost;Port=5433;Database=ixnos_data;Username=ixnos_data;Password=ixnos_data";

    public IxnosDataDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("IXNOS_DATA_ConnectionStrings__IxnosData") ?? LocalDefault;

        var options = new DbContextOptionsBuilder<IxnosDataDbContext>();
        IxnosDataDbContext.Configure(options, connectionString);
        var db = new IxnosDataDbContext(options.Options);
        // Migrations may rewrite every record (a backfill); normal requests keep the default.
        db.Database.SetCommandTimeout(TimeSpan.FromMinutes(10));
        return db;
    }
}
