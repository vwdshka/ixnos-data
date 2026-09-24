namespace IxnosData.Application.Items;

// Facts worth a second look, stated neutrally: the page says what the source shows and links to
// how each one is defined (ADR 0012). Both the badges and the search filter come from here.
public static class Signals
{
    // A competitive procedure that received exactly one offer (ΚΗΜΔΗΣ contracts that report it).
    public const string SingleOffer = "single_offer";

    // A direct award within 5% below the legal ceiling for direct awards.
    public const string NearDirectAwardLimit = "near_direct_award_limit";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { SingleOffer, NearDirectAwardLimit };

    // ΚΗΜΔΗΣ procedure type keys.
    public const string DirectAward = "6";
    private static readonly string[] Competitive = ["1", "2", "4", "7", "11", "13"]; // open, restricted, dialogue, negotiation, innovation

    // ΚΗΜΔΗΣ contract type key for works, whose direct-award ceiling is higher.
    public const string Works = "10";

    // Law 4412/2016 as amended by 4782/2021, excluding VAT. The ΚΗΜΔΗΣ data shows the spikes
    // just below both (see ADR 0012).
    public const decimal DirectAwardLimit = 30_000m;
    public const decimal WorksDirectAwardLimit = 60_000m;
    public const decimal Margin = 0.95m;

    public static IReadOnlyList<string> Of(string kind, string? procedureType, string? contractType, int? offers, decimal? amountEur)
    {
        var signals = new List<string>(2);
        if (offers == 1 && procedureType is not null && Competitive.Contains(procedureType))
        {
            signals.Add(SingleOffer);
        }

        if (kind is "award" or "contract" && procedureType == DirectAward && amountEur is { } amount)
        {
            var limit = contractType == Works ? WorksDirectAwardLimit : DirectAwardLimit;
            if (amount >= limit * Margin && amount <= limit)
            {
                signals.Add(NearDirectAwardLimit);
            }
        }

        return signals;
    }

    // The same rules as a SQL condition on procurement_item p. Fixed text only: the name comes
    // from a validated set, never from the request.
    public static string Sql(string signal) => signal switch
    {
        SingleOffer => $"(p.offers_received = 1 AND p.procedure_type IN ({string.Join(", ", Competitive.Select(c => $"'{c}'"))}))",
        NearDirectAwardLimit => FormattableString.Invariant($"""
            (p.kind IN ('award', 'contract') AND p.procedure_type = '{DirectAward}' AND (
                (p.contract_type = '{Works}' AND p.amount_eur BETWEEN {WorksDirectAwardLimit * Margin} AND {WorksDirectAwardLimit})
                OR (p.contract_type IS DISTINCT FROM '{Works}' AND p.amount_eur BETWEEN {DirectAwardLimit * Margin} AND {DirectAwardLimit})))
            """),
        _ => throw new ArgumentOutOfRangeException(nameof(signal), signal, "Unknown signal."),
    };
}
