namespace IxnosData.Domain.Users;

// Email and language are all we keep about a person. Deleting the account deletes the rest.
public class UserAccount
{
    public Guid Id { get; set; }

    public required string Email { get; set; }

    public required string Locale { get; set; } // "el" or "en"

    public string DigestFrequency { get; set; } = Users.DigestFrequency.Daily;

    public DateTimeOffset CreatedAt { get; set; }
}

// How often the alert digest is sent. Weekly digests go out on Mondays.
public static class DigestFrequency
{
    public const string Daily = "daily";
    public const string Weekly = "weekly";
    public const string Paused = "paused";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { Daily, Weekly, Paused };
}

// Sign-in links and sessions store only a SHA-256 of the token, so a leaked database can't
// be used to sign in.
public class LoginToken
{
    public required string TokenHash { get; set; }

    public required string Email { get; set; }

    public required string Locale { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? UsedAt { get; set; }
}

public class UserSession
{
    public required string TokenHash { get; set; }

    public Guid UserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }
}
