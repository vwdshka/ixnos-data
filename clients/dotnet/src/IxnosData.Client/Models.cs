namespace IxnosData.Client;

// The API's JSON, as records. Amounts are euros: ΚΗΜΔΗΣ states them without VAT (AmountEur),
// Διαύγεια with VAT (AmountWithVatEur).

/// <summary>A contracting authority, as a reference.</summary>
public sealed record OrganisationRef(string Id, string Name);

/// <summary>A code (CPV or NUTS) with its Greek and English labels.</summary>
public sealed record CodeLabel(string Code, string? LabelEl, string? LabelEn);

/// <summary>One record in a list of results.</summary>
public sealed record ItemSummary(
    string SourceId,
    string Source,
    string Kind,
    string Title,
    OrganisationRef? Organisation,
    decimal? AmountEur,
    DateTimeOffset PublishedAt,
    DateTimeOffset? DeadlineAt,
    string? NutsCode,
    IReadOnlyList<string> CpvCodes,
    bool Cancelled,
    decimal? AmountWithVatEur,
    IReadOnlyList<string>? Signals,
    bool AmountImplausible);

/// <summary>A page of search results. <see cref="Total"/> stops at 10,000 (<see cref="TotalCapped"/>).</summary>
public sealed record SearchResult(long Total, int Page, int PageSize, string Mode, IReadOnlyList<ItemSummary> Items, bool TotalCapped);

/// <summary>A contractor on a record. VAT numbers are never included.</summary>
public sealed record ItemContractor(string Name, string Role, decimal? AmountEur, string? CountryCode);

/// <summary>A link to another record: <see cref="Kind"/> and <see cref="Title"/> are null when ixnos-data doesn't hold it.</summary>
public sealed record ItemLink(string Relation, string Source, string SourceId, string? Kind, string? Title);

/// <summary>One record with everything known about it.</summary>
public sealed record ItemDetail(
    string SourceId,
    string Source,
    string Kind,
    string Title,
    string? Description,
    OrganisationRef? Organisation,
    decimal? AmountEur,
    decimal? AmountWithVatEur,
    DateTimeOffset PublishedAt,
    DateOnly? SignedOn,
    DateTimeOffset? DeadlineAt,
    DateOnly? StartsOn,
    DateOnly? EndsOn,
    bool Cancelled,
    DateOnly? CancelledOn,
    IReadOnlyList<CodeLabel> Cpv,
    CodeLabel? Nuts,
    IReadOnlyList<ItemContractor> Contractors,
    IReadOnlyList<ItemLink> Links,
    Uri? DocumentUrl,
    string? SupersededBy,
    string? Procedure,
    int? OffersReceived,
    IReadOnlyList<string>? Signals,
    bool AmountImplausible);

/// <summary>Awarded (ΚΗΜΔΗΣ, without VAT) next to approved and paid (Διαύγεια, with VAT) in one year.</summary>
public sealed record YearSpend(int Year, int Awards, decimal AmountEur, decimal ApprovedEur, decimal PaidEur);

/// <summary>A contractor of an authority, with what it was awarded and paid.</summary>
public sealed record ContractorSpend(string Name, int Awards, decimal AmountEur, decimal PaidEur);

/// <summary>One contractor with at least half of an authority's awarded value in the last 12 months.</summary>
public sealed record DominantSupplier(string Name, decimal Share, int Awards, int TotalAwards);

/// <summary>A contracting authority with its activity.</summary>
public sealed record OrganisationDetail(
    string Id,
    string NameEl,
    string? NameEn,
    string? Type,
    string? TaxId,
    OrganisationRef? Parent,
    Uri? Website,
    IReadOnlyDictionary<string, int> ItemCounts,
    decimal? AwardedLast12MonthsEur,
    decimal? PaidLast12MonthsEur,
    IReadOnlyList<YearSpend> AwardedByYear,
    IReadOnlyList<ContractorSpend> TopContractors,
    IReadOnlyList<ItemSummary> RecentItems,
    DominantSupplier? DominantSupplier);

/// <summary>When each source was last refreshed.</summary>
public sealed record DataStatus(DateTimeOffset? UpdatedAt, IReadOnlyList<SourceStatus> Sources);

/// <summary>When one source was last refreshed.</summary>
public sealed record SourceStatus(string Source, DateTimeOffset? UpdatedAt);
