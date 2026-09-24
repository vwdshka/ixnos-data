using Dapper;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Organisations;
using IxnosData.Application.Search;
using Npgsql;

namespace IxnosData.Infrastructure.Persistence.Queries;

public sealed class OrganisationQueries(NpgsqlDataSource dataSource, IItemQueries items) : IOrganisationQueries
{
    private const int RecentItems = 10;
    private const int TopContractors = 5;

    public async Task<OrganisationDetail?> GetAsync(string id, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var organisation = await connection.QuerySingleOrDefaultAsync<OrganisationRow>(new CommandDefinition(
            """
            SELECT o.id, o.name_el, o.name_en, o.type, o.tax_id, o.website,
                   o.parent_id, parent.name_el AS parent_name
            FROM organisation o LEFT JOIN organisation parent ON parent.id = o.parent_id
            WHERE o.id = @id
            """,
            new { id },
            cancellationToken: cancellationToken));
        if (organisation is null)
        {
            return null;
        }

        var counts = await connection.QueryAsync<KindCount>(new CommandDefinition(
            "SELECT kind, count(*)::int AS count FROM procurement_item WHERE organisation_id = @id GROUP BY kind",
            new { id },
            cancellationToken: cancellationToken));
        // Awarded: ΚΗΜΔΗΣ awards without VAT (contracts and payments repeat the same money).
        // Approved and paid: Διαύγεια spending approvals and payments, with VAT. Everywhere:
        // no cancelled or replaced records and no implausible amounts.
        const string Valid = "NOT p.cancelled AND p.superseded_by IS NULL";
        const string Awarded = "p.kind = 'award' AND p.amount_eur <= @plausibleMax";
        const string Approved = "p.source = 'diavgeia' AND p.kind = 'spending_approval' AND p.amount_with_vat_eur <= @plausibleMax";
        const string Paid = "p.source = 'diavgeia' AND p.kind = 'payment' AND p.amount_with_vat_eur <= @plausibleMax";
        var args = new { id, plausibleMax = Amounts.PlausibleMaxEur, top = TopContractors };

        var last12 = await connection.QuerySingleAsync<(decimal? Awarded, decimal? Paid)>(new CommandDefinition(
            $"""
            SELECT sum(p.amount_eur) FILTER (WHERE {Awarded}) AS awarded,
                   sum(p.amount_with_vat_eur) FILTER (WHERE {Paid}) AS paid
            FROM procurement_item p
            WHERE p.organisation_id = @id AND {Valid} AND p.published_at >= now() - interval '12 months'
            """,
            args,
            cancellationToken: cancellationToken));
        var byYear = await connection.QueryAsync<YearSpend>(new CommandDefinition(
            $"""
            SELECT extract(year FROM p.published_at AT TIME ZONE 'Europe/Athens')::int AS "Year",
                   count(*) FILTER (WHERE {Awarded})::int AS "Awards",
                   coalesce(sum(p.amount_eur) FILTER (WHERE {Awarded}), 0) AS "AmountEur",
                   coalesce(sum(p.amount_with_vat_eur) FILTER (WHERE {Approved}), 0) AS "ApprovedEur",
                   coalesce(sum(p.amount_with_vat_eur) FILTER (WHERE {Paid}), 0) AS "PaidEur"
            FROM procurement_item p
            WHERE p.organisation_id = @id AND {Valid} AND (({Awarded}) OR ({Approved}) OR ({Paid}))
            GROUP BY 1 ORDER BY 1 DESC
            """,
            args,
            cancellationToken: cancellationToken));
        // Contractors are one row per VAT number whichever source named them, so ΚΗΜΔΗΣ awards
        // and Διαύγεια payments to the same business meet here. A consortium member's own share
        // counts when the source gives one.
        var topContractors = await connection.QueryAsync<ContractorSpend>(new CommandDefinition(
            $"""
            SELECT * FROM (
            SELECT c.name AS "Name",
                   count(*) FILTER (WHERE ic.role = 'winner' AND {Awarded})::int AS "Awards",
                   coalesce(sum(coalesce(ic.amount_eur, p.amount_eur)) FILTER (WHERE ic.role = 'winner' AND {Awarded}), 0) AS "AmountEur",
                   coalesce(sum(coalesce(ic.amount_eur, p.amount_with_vat_eur)) FILTER (WHERE ic.role = 'payee' AND {Paid}), 0) AS "PaidEur"
            FROM procurement_item p
            JOIN item_contractor ic ON ic.item_id = p.id
            JOIN contractor c ON c.id = ic.contractor_id
            WHERE p.organisation_id = @id AND {Valid}
              AND ((ic.role = 'winner' AND {Awarded}) OR (ic.role = 'payee' AND {Paid}))
            GROUP BY c.id, c.name
            ) t ORDER BY greatest("AmountEur", "PaidEur") DESC LIMIT @top
            """,
            args,
            cancellationToken: cancellationToken));
        var leader = await connection.QuerySingleOrDefaultAsync<DominantSupplier>(new CommandDefinition(
            $"""
            WITH awards AS (
                SELECT c.id, c.name, coalesce(ic.amount_eur, p.amount_eur) AS amount
                FROM procurement_item p
                JOIN item_contractor ic ON ic.item_id = p.id AND ic.role = 'winner'
                JOIN contractor c ON c.id = ic.contractor_id
                WHERE p.organisation_id = @id AND {Valid} AND {Awarded}
                  AND p.published_at >= now() - interval '12 months')
            SELECT name AS "Name", coalesce(sum(amount) / nullif((SELECT sum(amount) FROM awards), 0), 0) AS "Share",
                   count(*)::int AS "Awards", (SELECT count(*) FROM awards)::int AS "TotalAwards"
            FROM awards GROUP BY id, name ORDER BY sum(amount) DESC NULLS LAST LIMIT 1
            """,
            args,
            cancellationToken: cancellationToken));
        var dominant = leader is { Share: >= DominantSupplier.MinShare, Awards: >= DominantSupplier.MinAwards, TotalAwards: >= DominantSupplier.MinTotalAwards }
            ? leader with { Share = Math.Round(leader.Share, 3) }
            : null;
        var recent = await items.SearchAsync(
            new SearchCriteria { OrganisationId = id, PageSize = RecentItems },
            cancellationToken);

        return new OrganisationDetail(
            organisation.Id,
            organisation.NameEl,
            organisation.NameEn,
            organisation.Type,
            organisation.TaxId,
            organisation.ParentId is null
                ? null
                : new OrganisationRef(organisation.ParentId, organisation.ParentName ?? organisation.ParentId),
            Uri.TryCreate(organisation.Website, UriKind.Absolute, out var website) ? website : null,
            counts.ToDictionary(c => c.Kind, c => c.Count, StringComparer.Ordinal),
            last12.Awarded,
            last12.Paid,
            [.. byYear],
            [.. topContractors],
            recent.Items,
            dominant);
    }

    internal sealed record OrganisationRow(
        string Id,
        string NameEl,
        string? NameEn,
        string? Type,
        string? TaxId,
        string? Website,
        string? ParentId,
        string? ParentName);

    internal sealed record KindCount(string Kind, int Count);
}
