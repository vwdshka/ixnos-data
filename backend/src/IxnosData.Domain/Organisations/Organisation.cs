namespace IxnosData.Domain.Organisations;

// ΚΗΜΔΗΣ and Διαύγεια use the same organisation IDs, so both sources point at the same row.
public class Organisation
{
    public required string Id { get; set; } // e.g. "6235", ΔΗΜΟΣ ΠΑΞΩΝ

    public required string NameEl { get; set; }

    public string? NameEn { get; set; }

    public string? Type { get; set; } // Διαύγεια category: MUNICIPALITY, HOSPITAL, ...

    // Not unique: departments often share their ministry's ΑΦΜ. Never use it as a key.
    public string? TaxId { get; set; }

    public string? ParentId { get; set; }

    public string? NutsCode { get; set; }

    public string? Website { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
