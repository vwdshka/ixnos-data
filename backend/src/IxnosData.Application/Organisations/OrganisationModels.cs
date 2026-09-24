using IxnosData.Application.Abstractions;
using IxnosData.Application.Search;

namespace IxnosData.Application.Organisations;

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
    DominantSupplier? DominantSupplier = null);

// One contractor holding at least half of the authority's awarded money over the last 12 months
// (with at least 10 awards in all and 3 to them). A fact, not a verdict: ADR 0012.
public sealed record DominantSupplier(string Name, decimal Share, int Awards, int TotalAwards)
{
    public const decimal MinShare = 0.5m;
    public const int MinAwards = 3;
    public const int MinTotalAwards = 10;
}

// Awarded is ΚΗΜΔΗΣ without VAT; approved and paid are Διαύγεια with VAT. Don't add them up.
public sealed record YearSpend(int Year, int Awards, decimal AmountEur, decimal ApprovedEur, decimal PaidEur);

// Awarded (ΚΗΜΔΗΣ) and paid (Διαύγεια), matched on VAT number, which stays out of the response.
public sealed record ContractorSpend(string Name, int Awards, decimal AmountEur, decimal PaidEur);

public sealed class GetOrganisationHandler(IOrganisationQueries queries)
{
    public Task<OrganisationDetail?> HandleAsync(string id, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return queries.GetAsync(id.Trim(), cancellationToken);
    }
}
