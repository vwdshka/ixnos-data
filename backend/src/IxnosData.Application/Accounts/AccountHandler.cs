using System.Net.Mail;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Search;
using IxnosData.Domain.Alerts;
using IxnosData.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Application.Accounts;

public sealed class AccountHandler(IAccountsDbContext db, IEmailSender email, TimeProvider clock, WebLinks links)
{
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(30);
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(90);
    public const int LinksPerHour = 5;
    public const int MaxSavedSearches = 20;

    // False only for a malformed address. We never say whether an account exists, and past the
    // hourly limit requests are dropped quietly.
    public async Task<bool> RequestLoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        if (!MailAddress.TryCreate(request.Email?.Trim(), out var address) || address.Address.Length > 254)
        {
            return false;
        }

        var emailAddress = address.Address.ToLowerInvariant();
        var locale = request.Locale == "en" ? "en" : "el";
        var now = clock.GetUtcNow();
        var recent = await db.LoginTokens.CountAsync(
            t => t.Email == emailAddress && t.CreatedAt > now.AddHours(-1), cancellationToken);
        if (recent >= LinksPerHour)
        {
            return true;
        }

        var token = Tokens.New();
        db.LoginTokens.Add(new LoginToken
        {
            TokenHash = Tokens.Hash(token),
            Email = emailAddress,
            Locale = locale,
            CreatedAt = now,
            ExpiresAt = now + LinkLifetime,
        });
        await db.SaveChangesAsync(cancellationToken);

        var link = links.Page(locale, "/login/verify?token=" + token);
        var (subject, text) = locale == "en"
            ? ("Sign in to ixnos-data", $"Open this link to sign in to ixnos-data (valid for 30 minutes):\n\n{link}\n\nIf you did not ask for it, ignore this email.")
            : ("Σύνδεση στο ixnos-data", $"Ανοίξτε αυτόν τον σύνδεσμο για να συνδεθείτε στο ixnos-data (ισχύει 30 λεπτά):\n\n{link}\n\nΑν δεν το ζητήσατε, αγνοήστε αυτό το μήνυμα.");
        var html = $"<p>{System.Net.WebUtility.HtmlEncode(text.Split("\n\n")[0])}</p><p><a href=\"{link}\">{link}</a></p>";
        await email.SendAsync(emailAddress, subject, text, html, cancellationToken);
        return true;
    }

    // The first use of a link creates the account.
    public async Task<SessionResult?> VerifyAsync(VerifyRequest request, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var hash = Tokens.Hash(request.Token ?? string.Empty);
        var login = await db.LoginTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (login is null || login.UsedAt is not null || login.ExpiresAt < now)
        {
            return null;
        }

        login.UsedAt = now;
        var user = await db.UserAccounts.SingleOrDefaultAsync(u => u.Email == login.Email, cancellationToken);
        if (user is null)
        {
            user = new UserAccount { Id = Guid.CreateVersion7(), Email = login.Email, Locale = login.Locale, CreatedAt = now };
            db.UserAccounts.Add(user);
        }

        var session = Tokens.New();
        var expires = now + SessionLifetime;
        db.UserSessions.Add(new UserSession { TokenHash = Tokens.Hash(session), UserId = user.Id, CreatedAt = now, ExpiresAt = expires });
        await db.SaveChangesAsync(cancellationToken);
        return new SessionResult(session, expires);
    }

    public async Task<UserAccount?> UserForSessionAsync(string sessionToken, CancellationToken cancellationToken)
    {
        var hash = Tokens.Hash(sessionToken);
        var now = clock.GetUtcNow();
        return await db.UserSessions
            .Where(s => s.TokenHash == hash && s.ExpiresAt > now)
            .Join(db.UserAccounts, s => s.UserId, u => u.Id, (_, u) => u)
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task LogoutAsync(string sessionToken, CancellationToken cancellationToken)
    {
        var hash = Tokens.Hash(sessionToken);
        await db.UserSessions.Where(s => s.TokenHash == hash).ExecuteDeleteAsync(cancellationToken);
    }

    public async Task<AccountView> GetAsync(UserAccount user, CancellationToken cancellationToken)
    {
        var searches = await db.SavedSearches
            .Where(s => s.UserId == user.Id)
            .OrderBy(s => s.CreatedAt)
            .Select(s => new SavedSearchView(s.Id, s.Name, s.Query, s.Kind, s.Cpv, s.Nuts, s.MinAmount, s.MaxAmount, s.CreatedAt))
            .ToListAsync(cancellationToken);
        return new AccountView(user.Email, user.Locale, searches, user.DigestFrequency);
    }

    public async Task<bool> SetDigestAsync(UserAccount user, DigestSettingsRequest request, CancellationToken cancellationToken)
    {
        if (!DigestFrequency.All.Contains(request.Frequency))
        {
            return false;
        }

        await db.UserAccounts
            .Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(u => u.DigestFrequency, request.Frequency), cancellationToken);
        return true;
    }

    // Sessions, saved searches and deliveries cascade.
    public async Task DeleteAsync(UserAccount user, CancellationToken cancellationToken)
    {
        await db.UserAccounts.Where(u => u.Id == user.Id).ExecuteDeleteAsync(cancellationToken);
        await db.LoginTokens.Where(t => t.Email == user.Email).ExecuteDeleteAsync(cancellationToken);
    }

    // Same validation as /v1/search.
    public async Task<(SavedSearchView? Saved, IDictionary<string, string[]>? Errors)> SaveSearchAsync(
        UserAccount user, SavedSearchRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        SearchItemsHandler.Interpret(
            new SearchItemsRequest(request.Q, request.Kind is null ? null : [request.Kind], request.Cpv, request.Nuts,
                null, request.MinAmount, request.MaxAmount, null, null, null, null),
            errors);
        if (await db.SavedSearches.CountAsync(s => s.UserId == user.Id, cancellationToken) >= MaxSavedSearches)
        {
            errors["savedSearches"] = [$"At most {MaxSavedSearches} saved searches per account."];
        }

        if (errors.Count > 0)
        {
            return (null, errors);
        }

        var now = clock.GetUtcNow();
        var name = string.IsNullOrWhiteSpace(request.Name) ? request.Q?.Trim() ?? request.Cpv ?? "—" : request.Name.Trim();
        var search = new SavedSearch
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            Name = name[..Math.Min(name.Length, 200)],
            Query = request.Q?.Trim(),
            Kind = request.Kind,
            Cpv = request.Cpv,
            Nuts = request.Nuts,
            MinAmount = request.MinAmount,
            MaxAmount = request.MaxAmount,
            CreatedAt = now,
            CheckedUpTo = now,
        };
        db.SavedSearches.Add(search);
        await db.SaveChangesAsync(cancellationToken);
        return (new SavedSearchView(search.Id, search.Name, search.Query, search.Kind, search.Cpv, search.Nuts,
            search.MinAmount, search.MaxAmount, search.CreatedAt), null);
    }

    public async Task<bool> DeleteSearchAsync(UserAccount user, Guid id, CancellationToken cancellationToken)
    {
        return await db.SavedSearches.Where(s => s.Id == id && s.UserId == user.Id).ExecuteDeleteAsync(cancellationToken) > 0;
    }
}
