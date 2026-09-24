namespace IxnosData.Application.Search;

public sealed record SearchItemsRequest(
    string? Q,
    string[]? Kind,
    string? Cpv,
    string? Nuts,
    string? Organisation,
    decimal? MinAmount,
    decimal? MaxAmount,
    DateOnly? From,
    DateOnly? To,
    int? Page,
    int? PageSize,
    string? Sort = null,
    string? Signal = null);

public enum QueryMode
{
    None,       // filters only
    Text,       // full-text plus trigram typo matching
    Greeklish,  // phonetic keys, plus full-text for real Latin words
    Identifier, // ΑΔΑΜ or ΑΔΑ
    TaxId,      // records of that organisation or contractor
}

public enum SearchSort
{
    Relevance, // newest first when there's no text
    Newest,
    Deadline,
    Amount,
}

public sealed record SearchCriteria
{
    public QueryMode Mode { get; init; }

    public string? Text { get; init; }

    public string? NormalisedText { get; init; }

    public IReadOnlyList<string> GreeklishKeys { get; init; } = [];

    public string? Identifier { get; init; }

    public string? TaxId { get; init; }

    public IReadOnlyList<string> Kinds { get; init; } = [];

    // A prefix: "3314" matches every code starting 3314.
    public string? CpvPrefix { get; init; }

    public string? NutsPrefix { get; init; }

    public string? OrganisationId { get; init; }

    public decimal? MinAmount { get; init; }

    public decimal? MaxAmount { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? Signal { get; init; }

    public SearchSort Sort { get; init; }

    // The digest's checkpoint.
    public DateTimeOffset? IngestedAfter { get; init; }

    public int Page { get; init; } = 1;

    public int PageSize { get; init; } = SearchItemsHandler.DefaultPageSize;
}

public sealed record OrganisationRef(string Id, string Name);

// The sources have typos, like a €202 billion contract.
public static class Amounts
{
    // Above this an amount is shown with a warning and left out of totals and sorting.
    public const decimal PlausibleMaxEur = 1_000_000_000m;

    public static bool IsImplausible(decimal? amount) => amount > PlausibleMaxEur;
}

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
    IReadOnlyList<string>? Signals = null)
{
    public bool AmountImplausible => Amounts.IsImplausible(AmountEur);
}

// Total stops counting at MaxResultWindow; TotalCapped says there are more.
public sealed record SearchItemsResult(
    int Total,
    int Page,
    int PageSize,
    string Mode,
    IReadOnlyList<ItemSummary> Items,
    bool TotalCapped = false);

public sealed record SearchOutcome(SearchItemsResult? Result, IDictionary<string, string[]>? Errors)
{
    public static SearchOutcome Found(SearchItemsResult result) => new(result, null);

    public static SearchOutcome Invalid(IDictionary<string, string[]> errors) => new(null, errors);
}
