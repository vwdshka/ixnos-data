using IxnosData.Application.Abstractions;
using IxnosData.Application.Search;

namespace IxnosData.Application.Items;

public sealed record CodeLabel(string Code, string? LabelEl, string? LabelEn);

// No VAT numbers here on purpose: for a sole trader the VAT number identifies a person.
public sealed record ItemContractorView(string Name, string Role, decimal? AmountEur, string? CountryCode);

// Kind and Title stay null until the target record is ingested.
public sealed record ItemLinkView(string Relation, string Source, string SourceId, string? Kind, string? Title);

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
    IReadOnlyList<ItemContractorView> Contractors,
    IReadOnlyList<ItemLinkView> Links,
    Uri? DocumentUrl,
    string? SupersededBy,
    string? Procedure = null,
    int? OffersReceived = null,
    IReadOnlyList<string>? Signals = null)
{
    public bool AmountImplausible => Amounts.IsImplausible(AmountEur);
}

public sealed class GetItemHandler(IItemQueries queries)
{
    public Task<ItemDetail?> HandleAsync(string sourceId, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceId);
        var trimmed = sourceId.Trim();
        // ΑΔΑ may arrive lowercased or with Latin look-alikes; ΑΔΑΜ are uppercased.
        var id = Ada.Normalise(trimmed) ?? trimmed.ToUpperInvariant();
        return queries.GetAsync(id, cancellationToken);
    }
}

public static class SourceDocuments
{
    private static readonly Dictionary<string, string> KhmdhsPaths = new(StringComparer.Ordinal)
    {
        ["request"] = "request",
        ["notice"] = "notice",
        ["award"] = "auction",
        ["contract"] = "contract",
        ["payment"] = "payment",
    };

    public static Uri? For(string source, string kind, string sourceId) => source switch
    {
        "khmdhs" when KhmdhsPaths.TryGetValue(kind, out var path) =>
            new Uri($"https://cerpp.eprocurement.gov.gr/khmdhs-opendata/{path}/attachment/{Uri.EscapeDataString(sourceId)}"),
        "diavgeia" => new Uri($"https://diavgeia.gov.gr/doc/{Uri.EscapeDataString(sourceId)}"),
        _ => null,
    };
}
