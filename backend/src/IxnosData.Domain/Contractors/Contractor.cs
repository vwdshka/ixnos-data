namespace IxnosData.Domain.Contractors;

// Sole traders show up here by name. They're only ever shown next to their records: no
// person pages.
public class Contractor
{
    public long Id { get; set; }

    // Checked ΑΦΜ, unique when set. Null for foreign or invalid numbers.
    public string? TaxId { get; set; }

    public required string Name { get; set; }

    public string? CountryCode { get; set; }
}

// A record can name several contractors (consortia).
public class ItemContractor
{
    public long ItemId { get; set; }

    public long ContractorId { get; set; }

    public ContractorRole Role { get; set; }

    public decimal? AmountEur { get; set; } // this contractor's share, when the source splits it
}

public enum ContractorRole
{
    Winner,
    Payee,
}
