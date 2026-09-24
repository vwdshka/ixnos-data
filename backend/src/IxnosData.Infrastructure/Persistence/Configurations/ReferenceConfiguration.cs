using IxnosData.Domain.Reference;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IxnosData.Infrastructure.Persistence.Configurations;

public class CpvCodeConfiguration : IEntityTypeConfiguration<CpvCode>
{
    public void Configure(EntityTypeBuilder<CpvCode> builder)
    {
        builder.ToTable("cpv_code");
        builder.HasKey(cpv => cpv.Code);
        builder.Property(cpv => cpv.Code).HasMaxLength(10);
        builder.Property(cpv => cpv.ParentCode).HasMaxLength(10);
        builder.HasOne<CpvCode>().WithMany().HasForeignKey(cpv => cpv.ParentCode).OnDelete(DeleteBehavior.Restrict);
    }
}

public class NutsRegionConfiguration : IEntityTypeConfiguration<NutsRegion>
{
    public void Configure(EntityTypeBuilder<NutsRegion> builder)
    {
        builder.ToTable("nuts_region");
        builder.HasKey(nuts => nuts.Code);
        builder.Property(nuts => nuts.Code).HasMaxLength(5);
        builder.Property(nuts => nuts.ParentCode).HasMaxLength(5);
        builder.HasOne<NutsRegion>().WithMany().HasForeignKey(nuts => nuts.ParentCode).OnDelete(DeleteBehavior.Restrict);
    }
}
