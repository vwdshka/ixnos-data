using IxnosData.Domain.Alerts;
using IxnosData.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IxnosData.Infrastructure.Persistence.Configurations;

public class UserAccountConfiguration : IEntityTypeConfiguration<UserAccount>
{
    public void Configure(EntityTypeBuilder<UserAccount> builder)
    {
        builder.ToTable("user_account");
        builder.Property(u => u.Email).HasMaxLength(254);
        builder.Property(u => u.Locale).HasMaxLength(2);
        builder.Property(u => u.DigestFrequency).HasMaxLength(8).HasDefaultValue(DigestFrequency.Daily);
        builder.HasIndex(u => u.Email).IsUnique();
    }
}

public class LoginTokenConfiguration : IEntityTypeConfiguration<LoginToken>
{
    public void Configure(EntityTypeBuilder<LoginToken> builder)
    {
        builder.ToTable("login_token");
        builder.HasKey(t => t.TokenHash);
        builder.Property(t => t.TokenHash).HasMaxLength(64);
        builder.Property(t => t.Email).HasMaxLength(254);
        builder.Property(t => t.Locale).HasMaxLength(2);
        builder.HasIndex(t => new { t.Email, t.CreatedAt });
    }
}

public class UserSessionConfiguration : IEntityTypeConfiguration<UserSession>
{
    public void Configure(EntityTypeBuilder<UserSession> builder)
    {
        builder.ToTable("user_session");
        builder.HasKey(s => s.TokenHash);
        builder.Property(s => s.TokenHash).HasMaxLength(64);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class SavedSearchConfiguration : IEntityTypeConfiguration<SavedSearch>
{
    public void Configure(EntityTypeBuilder<SavedSearch> builder)
    {
        builder.ToTable("saved_search");
        builder.Property(s => s.Name).HasMaxLength(200);
        builder.Property(s => s.Query).HasMaxLength(200);
        builder.Property(s => s.Kind).HasMaxLength(24);
        builder.Property(s => s.Cpv).HasMaxLength(10);
        builder.Property(s => s.Nuts).HasMaxLength(5);
        builder.Property(s => s.MinAmount).HasPrecision(18, 2);
        builder.Property(s => s.MaxAmount).HasPrecision(18, 2);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class AlertDeliveryConfiguration : IEntityTypeConfiguration<AlertDelivery>
{
    public void Configure(EntityTypeBuilder<AlertDelivery> builder)
    {
        builder.ToTable("alert_delivery");
        builder.HasKey(d => new { d.SavedSearchId, d.ItemSourceId });
        builder.Property(d => d.ItemSourceId).HasMaxLength(32);
        builder.HasOne<SavedSearch>().WithMany().HasForeignKey(d => d.SavedSearchId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.ToTable("api_key");
        builder.Property(k => k.Name).HasMaxLength(100);
        builder.Property(k => k.Prefix).HasMaxLength(12);
        builder.Property(k => k.KeyHash).HasMaxLength(64);
        builder.HasIndex(k => k.KeyHash).IsUnique();
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(k => k.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
