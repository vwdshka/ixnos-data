using IxnosData.Domain.Organisations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IxnosData.Infrastructure.Persistence.Configurations;

public class OrganisationConfiguration : IEntityTypeConfiguration<Organisation>
{
    public void Configure(EntityTypeBuilder<Organisation> builder)
    {
        builder.ToTable("organisation");
        builder.HasKey(org => org.Id);
        builder.Property(org => org.Id).HasMaxLength(16);
        builder.Property(org => org.ParentId).HasMaxLength(16);
        builder.Property(org => org.Type).HasMaxLength(32);
        builder.Property(org => org.TaxId).HasMaxLength(9);
        builder.Property(org => org.NutsCode).HasMaxLength(5);

        builder.HasOne<Organisation>().WithMany().HasForeignKey(org => org.ParentId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(org => org.TaxId);
    }
}
