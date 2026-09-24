using IxnosData.Domain.Alerts;
using IxnosData.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Application.Abstractions;

public interface IAccountsDbContext
{
    DbSet<UserAccount> UserAccounts { get; }

    DbSet<LoginToken> LoginTokens { get; }

    DbSet<UserSession> UserSessions { get; }

    DbSet<SavedSearch> SavedSearches { get; }

    DbSet<AlertDelivery> AlertDeliveries { get; }

    DbSet<ApiKey> ApiKeys { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IEmailSender
{
    Task SendAsync(string recipient, string subject, string text, string html, CancellationToken cancellationToken);
}
