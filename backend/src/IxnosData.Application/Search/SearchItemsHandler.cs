using System.Text.Json;
using System.Text.RegularExpressions;
using IxnosData.Application.Abstractions;

namespace IxnosData.Application.Search;

// Identifiers and VAT numbers are exact lookups, Latin text is read as Greeklish, anything else
// goes to full-text search with typo tolerance.
public sealed partial class SearchItemsHandler(IItemQueries queries)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    public const int MaxResultWindow = 10_000;

    public static readonly IReadOnlySet<string> Kinds = new HashSet<string>(StringComparer.Ordinal)
    {
        "request", "notice", "award", "contract", "payment", "commitment", "spending_approval", "final_award",
    };

    public async Task<SearchOutcome> HandleAsync(SearchItemsRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var criteria = Interpret(request, errors);
        if (errors.Count > 0)
        {
            return SearchOutcome.Invalid(errors);
        }

        return SearchOutcome.Found(await queries.SearchAsync(criteria, cancellationToken));
    }

    public static SearchCriteria Interpret(SearchItemsRequest request, Dictionary<string, string[]> errors)
    {
        var page = request.Page ?? 1;
        var pageSize = request.PageSize ?? DefaultPageSize;
        if (page < 1)
        {
            errors["page"] = ["Must be 1 or more."];
        }
        else if ((long)page * pageSize > MaxResultWindow)
        {
            errors["page"] = [$"Only the first {MaxResultWindow} results can be paged through; narrow the search."];
        }

        if (pageSize is < 1 or > MaxPageSize)
        {
            errors["pageSize"] = [$"Must be between 1 and {MaxPageSize}."];
        }

        var kinds = (request.Kind ?? [])
            .SelectMany(k => k.Split(','))
            .Select(k => k.Trim())
            .Where(k => k.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var unknownKinds = kinds.Where(k => !Kinds.Contains(k)).ToArray();
        if (unknownKinds.Length > 0)
        {
            errors["kind"] = [$"Unknown kind(s): {string.Join(", ", unknownKinds)}. Known: {string.Join(", ", Kinds)}."];
        }

        string? cpvPrefix = null;
        if (!string.IsNullOrWhiteSpace(request.Cpv))
        {
            var digits = request.Cpv.Trim().Split('-')[0];
            if (CpvDigits().IsMatch(digits))
            {
                // A full code ("33141000-0") means that code and everything under it.
                cpvPrefix = digits.TrimEnd('0').PadRight(2, '0');
            }
            else
            {
                errors["cpv"] = ["A CPV code or prefix of 2 to 8 digits, e.g. 3314 or 33141000-0."];
            }
        }

        var nuts = request.Nuts?.Trim().ToUpperInvariant();
        if (!string.IsNullOrEmpty(nuts) && !NutsCode().IsMatch(nuts))
        {
            errors["nuts"] = ["A NUTS code or prefix, e.g. EL54."];
        }

        if (request.MinAmount > request.MaxAmount)
        {
            errors["minAmount"] = ["Must not exceed maxAmount."];
        }

        var sort = ParseSort(request.Sort?.Trim());
        if (sort is null)
        {
            errors["sort"] = ["One of: relevance, newest, deadline, amount."];
        }

        if (!string.IsNullOrWhiteSpace(request.Signal) && !Items.Signals.All.Contains(request.Signal.Trim()))
        {
            errors["signal"] = [$"One of: {string.Join(", ", Items.Signals.All)}."];
        }

        if (request.From > request.To)
        {
            errors["from"] = ["Must not be after 'to'."];
        }

        var criteria = new SearchCriteria
        {
            Kinds = kinds,
            CpvPrefix = cpvPrefix,
            NutsPrefix = string.IsNullOrEmpty(nuts) ? null : nuts,
            OrganisationId = string.IsNullOrWhiteSpace(request.Organisation) ? null : request.Organisation.Trim(),
            MinAmount = request.MinAmount,
            MaxAmount = request.MaxAmount,
            From = request.From,
            To = request.To,
            Sort = sort ?? SearchSort.Relevance,
            Signal = string.IsNullOrWhiteSpace(request.Signal) ? null : request.Signal.Trim(),
            Page = page,
            PageSize = pageSize,
        };
        return WithText(criteria, request.Q?.Trim());
    }

    // By name only: Enum.TryParse would also accept "7". Null means an unknown name.
    private static SearchSort? ParseSort(string? name) => string.IsNullOrEmpty(name)
        ? SearchSort.Relevance
        : Enum.GetValues<SearchSort>().Cast<SearchSort?>()
            .FirstOrDefault(s => s.ToString()!.Equals(name, StringComparison.OrdinalIgnoreCase));

    public static string ModeName(QueryMode mode) => JsonNamingPolicy.SnakeCaseLower.ConvertName(mode.ToString());

    private static SearchCriteria WithText(SearchCriteria criteria, string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return criteria;
        }

        if (Adam().IsMatch(text))
        {
            return criteria with { Mode = QueryMode.Identifier, Identifier = text.ToUpperInvariant() };
        }

        if (Ada.Normalise(text) is { } ada)
        {
            return criteria with { Mode = QueryMode.Identifier, Identifier = ada };
        }

        if (TaxIdDigits().IsMatch(text))
        {
            return criteria with { Mode = QueryMode.TaxId, TaxId = text };
        }

        var normalised = GreekText.Normalise(text);
        var isGreeklish = LatinLetter().IsMatch(normalised) && !GreekLetter().IsMatch(normalised);
        return criteria with
        {
            Mode = isGreeklish ? QueryMode.Greeklish : QueryMode.Text,
            Text = text,
            NormalisedText = normalised,
            GreeklishKeys = isGreeklish ? GreekText.SearchKeys(text) : [],
        };
    }

    [GeneratedRegex(@"^\d{2}(REQ|PROC|AWRD|SYMV|PAY)\d{9,10}$", RegexOptions.IgnoreCase)]
    private static partial Regex Adam();

    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex TaxIdDigits();

    [GeneratedRegex(@"^\d{2,8}$")]
    private static partial Regex CpvDigits();

    [GeneratedRegex("^[A-Z]{2}[0-9A-Z]{0,3}$")]
    private static partial Regex NutsCode();

    [GeneratedRegex("[a-z]")]
    private static partial Regex LatinLetter();

    [GeneratedRegex(@"[Ͱ-Ͽ]")]
    private static partial Regex GreekLetter();
}
