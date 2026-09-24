namespace IxnosData.Application.Accounts;

public sealed record LoginRequest(string Email, string? Locale);

public sealed record VerifyRequest(string Token);

public sealed record SessionResult(string SessionToken, DateTimeOffset ExpiresAt);

public sealed record SavedSearchRequest(
    string? Name, string? Q, string? Kind, string? Cpv, string? Nuts, decimal? MinAmount, decimal? MaxAmount);

public sealed record SavedSearchView(
    Guid Id, string Name, string? Q, string? Kind, string? Cpv, string? Nuts, decimal? MinAmount, decimal? MaxAmount,
    DateTimeOffset CreatedAt);

public sealed record AccountView(string Email, string Locale, IReadOnlyList<SavedSearchView> SavedSearches, string DigestFrequency);

// "daily", "weekly" (Mondays) or "paused".
public sealed record DigestSettingsRequest(string Frequency);

public sealed record ApiKeyRequest(string? Name);

public sealed record ApiKeyView(Guid Id, string Name, string Prefix, int PermitsPerMinute, DateTimeOffset CreatedAt);

// Key is shown to the user once and never stored.
public sealed record CreatedApiKey(ApiKeyView ApiKey, string Key);

public sealed record ApiKeyGrant(Guid Id, int PermitsPerMinute);
