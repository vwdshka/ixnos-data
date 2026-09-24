namespace IxnosData.Domain.Users;

// Only the hash is stored. Prefix is the start of the key, so the owner can tell keys apart.
public class ApiKey
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public required string Name { get; set; }

    public required string Prefix { get; set; }

    public required string KeyHash { get; set; }

    public int PermitsPerMinute { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
}
