using System.Globalization;

namespace IxnosData.Client;

/// <summary>
/// A search: words (Greek, Greeklish, an ΑΔΑΜ/ΑΔΑ or a VAT number) and filters. Everything is optional.
/// </summary>
public sealed record SearchOptions
{
    /// <summary>Words to search for.</summary>
    public string? Query { get; init; }

    /// <summary>Record kinds, e.g. "notice", "award", "contract", "payment".</summary>
    public IReadOnlyList<string> Kinds { get; init; } = [];

    /// <summary>A CPV code or prefix, e.g. "33" or "33600000-6".</summary>
    public string? Cpv { get; init; }

    /// <summary>A NUTS code or prefix, e.g. "EL5".</summary>
    public string? Nuts { get; init; }

    /// <summary>A contracting authority's id.</summary>
    public string? Organisation { get; init; }

    /// <summary>Minimum amount in euros.</summary>
    public decimal? MinAmount { get; init; }

    /// <summary>Maximum amount in euros.</summary>
    public decimal? MaxAmount { get; init; }

    /// <summary>Published on or after this date.</summary>
    public DateOnly? From { get; init; }

    /// <summary>Published on or before this date.</summary>
    public DateOnly? To { get; init; }

    /// <summary>"relevance" (default), "newest", "deadline" or "amount".</summary>
    public string? Sort { get; init; }

    /// <summary>"single_offer" or "near_direct_award_limit".</summary>
    public string? Signal { get; init; }

    /// <summary>Page number, from 1.</summary>
    public int? Page { get; init; }

    /// <summary>Results per page, 1 to 100.</summary>
    public int? PageSize { get; init; }

    internal string ToQueryString()
    {
        var pairs = new List<(string Name, string Value)>();
        void Add(string name, string? value)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                pairs.Add((name, value));
            }
        }

        Add("q", Query);
        foreach (var kind in Kinds)
        {
            Add("kind", kind);
        }

        Add("cpv", Cpv);
        Add("nuts", Nuts);
        Add("organisation", Organisation);
        Add("minAmount", MinAmount?.ToString(CultureInfo.InvariantCulture));
        Add("maxAmount", MaxAmount?.ToString(CultureInfo.InvariantCulture));
        Add("from", From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        Add("to", To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        Add("sort", Sort);
        Add("signal", Signal);
        Add("page", Page?.ToString(CultureInfo.InvariantCulture));
        Add("pageSize", PageSize?.ToString(CultureInfo.InvariantCulture));
        return string.Join("&", pairs.Select(p => $"{p.Name}={Uri.EscapeDataString(p.Value)}"));
    }
}
