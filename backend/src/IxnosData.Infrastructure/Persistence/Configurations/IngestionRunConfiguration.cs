using IxnosData.Domain.Operations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IxnosData.Infrastructure.Persistence.Configurations;

public class IngestionRunConfiguration : IEntityTypeConfiguration<IngestionRun>
{
    public void Configure(EntityTypeBuilder<IngestionRun> builder)
    {
        builder.ToTable("ingestion_run");

        builder.Property(run => run.Source).HasMaxLength(32);
        builder.Property(run => run.Mode).HasMaxLength(32);

        // Stored as lowercase text so the Python pipeline writes plain strings.
        builder.Property(run => run.Status)
            .HasMaxLength(16)
            .HasConversion(
                status => status.ToString().ToLowerInvariant(),
                value => Enum.Parse<IngestionRunStatus>(value, ignoreCase: true));

        builder.Property(run => run.Details).HasColumnType("jsonb");

        // Alarms and the status page read the latest runs per source.
        builder.HasIndex(run => new { run.Source, run.StartedAt }).IsDescending(false, true);
    }
}
