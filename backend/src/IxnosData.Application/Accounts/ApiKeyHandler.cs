using IxnosData.Application.Abstractions;
using IxnosData.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Application.Accounts;

public sealed class ApiKeyHandler(IAccountsDbContext db, TimeProvider clock)
{
    public const string KeyPrefix = "ixn_";
    public const int DefaultPermitsPerMinute = 600;
    public const int MaxActiveKeys = 5;

    public async Task<CreatedApiKey?> CreateAsync(UserAccount user, ApiKeyRequest request, CancellationToken cancellationToken)
    {
        var active = await db.ApiKeys.CountAsync(k => k.UserId == user.Id && k.RevokedAt == null, cancellationToken);
        if (active >= MaxActiveKeys)
        {
            return null;
        }

        var key = KeyPrefix + Tokens.New();
        var name = string.IsNullOrWhiteSpace(request.Name) ? "API key" : request.Name.Trim();
        var apiKey = new ApiKey
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            Name = name[..Math.Min(name.Length, 100)],
            Prefix = key[..12],
            KeyHash = Tokens.Hash(key),
            PermitsPerMinute = DefaultPermitsPerMinute,
            CreatedAt = clock.GetUtcNow(),
        };
        db.ApiKeys.Add(apiKey);
        await db.SaveChangesAsync(cancellationToken);
        return new CreatedApiKey(View(apiKey), key);
    }

    public async Task<IReadOnlyList<ApiKeyView>> ListAsync(UserAccount user, CancellationToken cancellationToken)
    {
        var keys = await db.ApiKeys
            .Where(k => k.UserId == user.Id && k.RevokedAt == null)
            .OrderBy(k => k.CreatedAt)
            .ToListAsync(cancellationToken);
        return [.. keys.Select(View)];
    }

    public async Task<bool> RevokeAsync(UserAccount user, Guid id, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        return await db.ApiKeys
            .Where(k => k.Id == id && k.UserId == user.Id && k.RevokedAt == null)
            .ExecuteUpdateAsync(k => k.SetProperty(x => x.RevokedAt, now), cancellationToken) > 0;
    }

    // Null for unknown or revoked keys.
    public async Task<ApiKeyGrant?> ResolveAsync(string key, CancellationToken cancellationToken)
    {
        var hash = Tokens.Hash(key);
        return await db.ApiKeys
            .Where(k => k.KeyHash == hash && k.RevokedAt == null)
            .Select(k => new ApiKeyGrant(k.Id, k.PermitsPerMinute))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static ApiKeyView View(ApiKey key) => new(key.Id, key.Name, key.Prefix, key.PermitsPerMinute, key.CreatedAt);
}
