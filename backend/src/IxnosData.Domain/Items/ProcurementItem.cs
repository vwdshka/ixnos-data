namespace IxnosData.Domain.Items;

// Every kind of record (tender, award, contract, payment, decision) lives in this one table,
// so search, alerts and organisation pages only ever query one place.
public class ProcurementItem
{
    public long Id { get; set; }

    public required string Source { get; set; } // "khmdhs" or "diavgeia"

    // ΑΔΑΜ for ΚΗΜΔΗΣ ("26PROC019787840"), ΑΔΑ for Διαύγεια ("ΛΓ2ΣΩΗΥ-Ν4Ψ").
    public required string SourceId { get; set; }

    public ItemKind Kind { get; set; }

    // ΚΗΜΔΗΣ cuts titles at 100 characters, so the line items in Description carry the rest.
    public required string Title { get; set; }

    public string? Description { get; set; }

    // Greek CPV labels: searchable, never shown. Lets «πυροσβεστήρες» find «ειδών πυρασφάλειας».
    public string? Keywords { get; set; }

    public required string TextNormalised { get; set; }

    public required string SearchKey { get; set; } // Latin key of the title, for Greeklish queries

    public decimal? AmountEur { get; set; } // without VAT

    public decimal? AmountWithVatEur { get; set; }

    public string[] CpvCodes { get; set; } = [];

    // Place of work. Not a foreign key: a few records use foreign or country-level codes.
    public string? NutsCode { get; set; }

    public string? OrganisationId { get; set; }

    public DateTimeOffset PublishedAt { get; set; }

    public DateOnly? SignedOn { get; set; }

    public DateTimeOffset? DeadlineAt { get; set; }

    public DateOnly? StartsOn { get; set; }

    public DateOnly? EndsOn { get; set; }

    public bool Cancelled { get; set; }

    public DateOnly? CancelledOn { get; set; }

    // ΚΗΜΔΗΣ procedure and contract type keys ("6" = direct award, "10" = works) and the number
    // of offers received when a contract reports it. Null for Διαύγεια.
    public string? ProcedureType { get; set; }

    public string? ContractType { get; set; }

    public int? OffersReceived { get; set; }

    // Set when a later Διαύγεια decision corrects this one. The old record still opens by its
    // ΑΔΑ but drops out of search and totals.
    public string? SupersededBy { get; set; }

    public DateTimeOffset? SourceUpdatedAt { get; set; }

    public required string Raw { get; set; }

    public DateTimeOffset IngestedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
