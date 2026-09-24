using Dapper;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Items;
using IxnosData.Application.Search;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;

namespace IxnosData.Infrastructure.Persistence.Queries;

// Raw SQL because search needs PostgreSQL full-text and trigram features. Only fixed fragments are
// concatenated; every value is a parameter.
public sealed class ItemQueries(NpgsqlDataSource dataSource, IMemoryCache cache) : IItemQueries
{
    private const string SummaryColumns = """
        p.source_id, p.source, p.kind, p.title, p.organisation_id, o.name_el AS organisation_name,
        p.amount_eur, p.amount_with_vat_eur, p.published_at, p.deadline_at, p.nuts_code, p.cpv_codes, p.cancelled,
        p.procedure_type, p.contract_type, p.offers_received
        """;

    // Counting stops here: nobody pages past the result window, and an exact count of a common
    // word ("προμήθεια", 160,000+ matches) was most of a 25-second query.
    private const int CountCap = SearchItemsHandler.MaxResultWindow + 1;

    // Relevance is scored over at most this many of the newest matches (or as deep as the page
    // asked for). Limit: a very common word ranks recent records only; a stored rank column or
    // a search engine would lift that ceiling.
    private const int RelevancePool = 2000;

    // Typo and partial-word matching (trigrams) is slow on common words and adds nothing when
    // full-text search already finds plenty, so it only runs when full-text finds few.
    private const string FewFullTextHits =
        "(SELECT count(*) < 200 FROM (SELECT 1 FROM procurement_item q, fts WHERE q.search @@ fts.query LIMIT 200) few)";

    private const string Records = "procurement_item p LEFT JOIN organisation o ON o.id = p.organisation_id";

    public async Task<SearchItemsResult> SearchAsync(SearchCriteria criteria, CancellationToken cancellationToken)
    {
        var organisations = criteria.Mode == QueryMode.Greeklish
            ? await GreeklishOrganisationsAsync(criteria.GreeklishKeys, cancellationToken)
            : [];
        var (sql, parameters) = BuildSearch(criteria, organisations);
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = (await connection.QueryAsync<SummaryRow>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken))).ToList();

        var total = rows.Count > 0 ? (int)rows[0].Total : 0;
        return new SearchItemsResult(
            Total: Math.Min(total, SearchItemsHandler.MaxResultWindow),
            Page: criteria.Page,
            PageSize: criteria.PageSize,
            Mode: SearchItemsHandler.ModeName(criteria.Mode),
            Items: [.. rows.Select(row => row.ToSummary())],
            TotalCapped: total > SearchItemsHandler.MaxResultWindow);
    }

    // Greeklish authority names ("dimos thessalonikis"): the organisation table has only Greek
    // names, so each name's Greeklish key is computed once an hour and compared in memory
    // (about 5,500 names). The whole typed phrase has to appear, word for word.
    private async Task<IReadOnlyList<string>> GreeklishOrganisationsAsync(
        IReadOnlyList<string> keys, CancellationToken cancellationToken)
    {
        var phrases = keys.Where(key => key.Length >= 6).Select(key => " " + key + " ").ToList();
        if (phrases.Count == 0)
        {
            return [];
        }

        var names = await cache.GetOrCreateAsync("organisation-greeklish-keys", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
            await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
            var rows = await connection.QueryAsync<(string Id, string NameEl)>(new CommandDefinition(
                "SELECT id, name_el FROM organisation", cancellationToken: cancellationToken));
            return rows.Select(row => (row.Id, Key: " " + GreekText.SearchKey(row.NameEl) + " ")).ToList();
        });
        return [.. names!.Where(name => phrases.Any(name.Key.Contains)).Select(name => name.Id).Take(50)];
    }

    internal static (string Sql, DynamicParameters Parameters) BuildSearch(
        SearchCriteria criteria, IReadOnlyList<string>? greeklishOrganisations = null)
    {
        var parameters = new DynamicParameters();
        parameters.Add("text", criteria.Text);
        var ctes = new List<string> { "fts AS (SELECT websearch_to_tsquery('ixnos_data_greek', coalesce(@text, '')) AS query)" };
        var from = "fts";
        var where = new List<string>();
        string? score = null;

        switch (criteria.Mode)
        {
            case QueryMode.Text:
            case QueryMode.Greeklish:
                parameters.Add("normalised", criteria.NormalisedText);
                // Each way of matching is its own index lookup; OR-ing them in one WHERE made
                // PostgreSQL test every row of the table.
                var matches = new List<string>
                {
                    "SELECT p.id FROM procurement_item p, fts WHERE p.search @@ fts.query",
                    $"SELECT p.id FROM procurement_item p WHERE {FewFullTextHits} AND @normalised <% p.text_normalised",
                };
                var scoreParts = new List<string>
                {
                    "ts_rank(p.search, fts.query)",
                    "0.5 * word_similarity(@normalised, p.text_normalised)",
                };
                // Every word of a key contained exactly; typo matching only when no key finds 200
                // that way, since fuzzy matching a common word ("promitheia") took seconds.
                var exact = new List<Func<string, string>>();
                for (var i = 0; i < criteria.GreeklishKeys.Count; i++)
                {
                    var key = criteria.GreeklishKeys[i];
                    parameters.Add($"key{i}", key);
                    var words = key.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    for (var j = 0; j < words.Length; j++)
                    {
                        parameters.Add($"key{i}w{j}", "%" + LikeEscape(words[j]) + "%");
                    }

                    var index = i;
                    exact.Add(alias => "(" + string.Join(
                        " AND ", words.Select((_, j) => FormattableString.Invariant($"{alias}.search_key LIKE @key{index}w{j}"))) + ")");
                    matches.Add($"SELECT p.id FROM procurement_item p WHERE {exact[i]("p")}");
                    scoreParts.Add(FormattableString.Invariant($"0.5 * word_similarity(@key{i}, p.search_key)"));
                }

                if (criteria.GreeklishKeys.Count > 0)
                {
                    var anyExact = string.Join(" OR ", exact.Select(contains => contains("q")));
                    var anyFuzzy = string.Join(" OR ", criteria.GreeklishKeys.Select((_, i) => FormattableString.Invariant($"@key{i} <% p.search_key")));
                    matches.Add($"""
                        SELECT p.id FROM procurement_item p
                        WHERE (SELECT count(*) < 200 FROM (SELECT 1 FROM procurement_item q WHERE {anyExact} LIMIT 200) few)
                          AND ({anyFuzzy})
                        """);
                }

                // Authority names («Πανεπιστήμιο Ιωαννίνων», "dimos thessalonikis") find that
                // authority's records, not only titles that mention it.
                var organisationMatch = criteria.Mode == QueryMode.Text
                    ? """
                        org AS (SELECT coalesce(array_agg(id), '{}') AS ids FROM organisation
                            WHERE word_similarity(@normalised, translate(lower(unaccent(name_el)), 'ς', 'σ')) >= 0.8)
                        """
                    : greeklishOrganisations is { Count: > 0 } ? "org AS (SELECT @greeklishOrganisations::text[] AS ids)" : null;
                if (organisationMatch is not null)
                {
                    parameters.Add("greeklishOrganisations", greeklishOrganisations?.ToArray() ?? []);
                    ctes.Add(organisationMatch);
                    from += ", org";
                    matches.Add("SELECT p.id FROM procurement_item p, org WHERE p.organisation_id = ANY(org.ids)");
                    scoreParts.Add("CASE WHEN p.organisation_id = ANY(org.ids) THEN 1 ELSE 0 END");
                }

                ctes.Add($"matched AS ({string.Join("\n    UNION\n    ", matches)})");
                // Recency breaks ties between equally good matches; it decays over about three months.
                score = string.Join(" + ", scoreParts)
                    + " + 0.1 * exp(-extract(epoch FROM now() - p.published_at) / 7776000)";
                break;
            case QueryMode.Identifier:
                // The record itself, then records that reference it (a contract naming its ΑΔΑ).
                parameters.Add("identifier", criteria.Identifier);
                where.Add("""
                    (p.source_id = @identifier OR p.id IN (SELECT from_item_id FROM item_link
                        WHERE to_source IN ('khmdhs', 'diavgeia') AND to_source_id = @identifier))
                    """);
                score = "CASE WHEN p.source_id = @identifier THEN 1 ELSE 0 END";
                break;
            case QueryMode.TaxId:
                parameters.Add("taxId", criteria.TaxId);
                where.Add("""
                    (o.tax_id = @taxId OR EXISTS (
                        SELECT 1 FROM item_contractor ic JOIN contractor c ON c.id = ic.contractor_id
                        WHERE ic.item_id = p.id AND c.tax_id = @taxId))
                    """);
                break;
            case QueryMode.None:
                break;
        }

        AddFilters(criteria, where, parameters);
        if (criteria.Mode != QueryMode.Identifier)
        {
            // Corrected Διαύγεια decisions are found by their own ΑΔΑ, not in general results.
            where.Add("p.superseded_by IS NULL");
        }

        var offset = (criteria.Page - 1) * criteria.PageSize;
        parameters.Add("limit", criteria.PageSize);
        parameters.Add("offset", offset);
        var filter = where.Count > 0 ? string.Join("\n  AND ", where) : "true";

        string body;
        string total;
        if (criteria.Mode is QueryMode.Text or QueryMode.Greeklish)
        {
            // Matches are collected once and joined to. As an IN (...) PostgreSQL guesses a
            // text match returns ~200 rows, picks a nested loop, and a common word takes a minute.
            ctes.Add($"hits AS MATERIALIZED (SELECT p.id, p.published_at FROM matched JOIN {Records} ON p.id = matched.id WHERE {filter})");
            var source = "hits";
            if (criteria.Sort == SearchSort.Relevance)
            {
                parameters.Add("pool", Math.Max(RelevancePool, offset + criteria.PageSize));
                ctes.Add("pool AS (SELECT id FROM hits ORDER BY published_at DESC LIMIT @pool)");
                source = "pool";
            }

            body = $"FROM {source} JOIN procurement_item p ON p.id = {source}.id LEFT JOIN organisation o ON o.id = p.organisation_id, {from}";
            total = $"(SELECT count(*) FROM (SELECT 1 FROM hits LIMIT {CountCap}) capped)";
        }
        else
        {
            body = $"FROM {Records}, {from}\nWHERE {filter}";
            total = $"(SELECT count(*) FROM (SELECT 1 FROM {Records} WHERE {filter} LIMIT {CountCap}) capped)";
        }

        var sql = $"""
            WITH {string.Join(",\n", ctes)}
            SELECT {SummaryColumns}, {total} AS total
            {body}
            ORDER BY {OrderBy(criteria.Sort, score)}
            LIMIT @limit OFFSET @offset
            """;
        return (sql, parameters);
    }

    // Fixed fragments only; the sort is an enum, never user text.
    private static string OrderBy(SearchSort sort, string? score) => sort switch
    {
        SearchSort.Deadline =>
            "(p.deadline_at IS NULL OR p.deadline_at < now()), p.deadline_at, p.published_at DESC, p.id DESC",
        SearchSort.Amount =>
            FormattableString.Invariant(
                $"CASE WHEN p.amount_eur > {Amounts.PlausibleMaxEur} THEN NULL ELSE p.amount_eur END DESC NULLS LAST, p.published_at DESC, p.id DESC"),
        SearchSort.Relevance when score is not null => score + " DESC, p.published_at DESC, p.id DESC",
        _ => "p.published_at DESC, p.id DESC",
    };

    private static void AddFilters(SearchCriteria criteria, List<string> where, DynamicParameters parameters)
    {
        if (criteria.Kinds.Count > 0)
        {
            parameters.Add("kinds", criteria.Kinds.ToArray());
            where.Add("p.kind = ANY(@kinds)");
        }

        if (criteria.CpvPrefix is not null)
        {
            // Expand the prefix to concrete codes so the GIN index on cpv_codes is used.
            parameters.Add("cpvPrefix", criteria.CpvPrefix + "%");
            where.Add("p.cpv_codes && (SELECT coalesce(array_agg(code::text), '{}'::text[]) FROM cpv_code WHERE code LIKE @cpvPrefix)");
        }

        if (criteria.NutsPrefix is not null)
        {
            parameters.Add("nutsPrefix", criteria.NutsPrefix + "%");
            where.Add("p.nuts_code LIKE @nutsPrefix");
        }

        if (criteria.OrganisationId is not null)
        {
            parameters.Add("organisationId", criteria.OrganisationId);
            where.Add("p.organisation_id = @organisationId");
        }

        if (criteria.MinAmount is not null)
        {
            parameters.Add("minAmount", criteria.MinAmount);
            where.Add("p.amount_eur >= @minAmount");
        }

        if (criteria.MaxAmount is not null)
        {
            parameters.Add("maxAmount", criteria.MaxAmount);
            where.Add("p.amount_eur <= @maxAmount");
        }

        // Dates are days in Greek time.
        if (criteria.From is { } from)
        {
            parameters.Add("from", from.ToDateTime(TimeOnly.MinValue));
            where.Add("p.published_at >= (@from::timestamp AT TIME ZONE 'Europe/Athens')");
        }

        if (criteria.Signal is { } signal)
        {
            where.Add(Signals.Sql(signal));
        }

        if (criteria.To is { } to)
        {
            parameters.Add("to", to.AddDays(1).ToDateTime(TimeOnly.MinValue));
            where.Add("p.published_at < (@to::timestamp AT TIME ZONE 'Europe/Athens')");
        }

        if (criteria.IngestedAfter is { } ingestedAfter)
        {
            parameters.Add("ingestedAfter", ingestedAfter.UtcDateTime);
            where.Add("p.ingested_at > @ingestedAfter");
        }
    }

    public async Task<ItemDetail?> GetAsync(string sourceId, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var item = await connection.QuerySingleOrDefaultAsync<DetailRow>(new CommandDefinition(
            $"""
            SELECT p.id, {SummaryColumns}, p.description, p.signed_on,
                   p.starts_on, p.ends_on, p.cancelled_on, p.superseded_by, p.raw->'procedureType'->>'value' AS procedure
            FROM procurement_item p LEFT JOIN organisation o ON o.id = p.organisation_id
            WHERE p.source_id = @sourceId
            """,
            new { sourceId },
            cancellationToken: cancellationToken));
        if (item is null)
        {
            return null;
        }

        var cpv = await connection.QueryAsync<CodeLabelRow>(new CommandDefinition(
            "SELECT code, label_el, label_en FROM cpv_code WHERE code = ANY(@codes)",
            new { codes = item.CpvCodes },
            cancellationToken: cancellationToken));
        var nuts = item.NutsCode is null ? null : await connection.QuerySingleOrDefaultAsync<CodeLabelRow>(
            new CommandDefinition(
                "SELECT code, label_el, label_en FROM nuts_region WHERE code = @code",
                new { code = item.NutsCode },
                cancellationToken: cancellationToken));
        var contractors = await connection.QueryAsync<ContractorRow>(new CommandDefinition(
            """
            SELECT c.name, ic.role, ic.amount_eur, c.country_code
            FROM item_contractor ic JOIN contractor c ON c.id = ic.contractor_id
            WHERE ic.item_id = @id ORDER BY ic.role, c.name
            """,
            new { id = item.Id },
            cancellationToken: cancellationToken));
        var links = await connection.QueryAsync<LinkRow>(new CommandDefinition(
            """
            SELECT l.relation, l.to_source, l.to_source_id, t.kind, t.title
            FROM item_link l LEFT JOIN procurement_item t ON t.id = l.to_item_id
            WHERE l.from_item_id = @id ORDER BY l.relation, l.to_source_id
            """,
            new { id = item.Id },
            cancellationToken: cancellationToken));

        var cpvByCode = cpv.ToDictionary(c => c.Code, StringComparer.Ordinal);
        return new ItemDetail(
            item.SourceId,
            item.Source,
            item.Kind,
            item.Title,
            item.Description,
            item.Organisation(),
            item.AmountEur,
            item.AmountWithVatEur,
            Utc(item.PublishedAt),
            DateOnlyOf(item.SignedOn),
            item.DeadlineAt is { } deadline ? Utc(deadline) : null,
            DateOnlyOf(item.StartsOn),
            DateOnlyOf(item.EndsOn),
            item.Cancelled,
            DateOnlyOf(item.CancelledOn),
            [.. item.CpvCodes.Select(code => cpvByCode.TryGetValue(code, out var label)
                ? label.ToCodeLabel()
                : new CodeLabel(code, null, null))],
            nuts?.ToCodeLabel() ?? (item.NutsCode is null ? null : new CodeLabel(item.NutsCode, null, null)),
            [.. contractors.Select(c => new ItemContractorView(c.Name, c.Role, c.AmountEur, c.CountryCode))],
            [.. links.Select(l => new ItemLinkView(l.Relation, l.ToSource, l.ToSourceId, l.Kind, l.Title))],
            SourceDocuments.For(item.Source, item.Kind, item.SourceId),
            item.SupersededBy,
            item.Procedure,
            item.OffersReceived,
            item.Signals());
    }

    private static string LikeEscape(string text) =>
        text.Replace(@"\", @"\\", StringComparison.Ordinal).Replace("%", @"\%", StringComparison.Ordinal).Replace("_", @"\_", StringComparison.Ordinal);

    internal static DateTimeOffset Utc(DateTime value) => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));

    private static DateOnly? DateOnlyOf(DateTime? value) => value is { } date ? DateOnly.FromDateTime(date) : null;

    // Row types mirror the SQL columns; Dapper maps snake_case to these (MatchNamesWithUnderscores).
    internal class SummaryRow
    {
        public string SourceId { get; init; } = "";
        public string Source { get; init; } = "";
        public string Kind { get; init; } = "";
        public string Title { get; init; } = "";
        public string? OrganisationId { get; init; }
        public string? OrganisationName { get; init; }
        public decimal? AmountEur { get; init; }
        public decimal? AmountWithVatEur { get; init; }
        public DateTime PublishedAt { get; init; }
        public DateTime? DeadlineAt { get; init; }
        public string? NutsCode { get; init; }
        public string[] CpvCodes { get; init; } = [];
        public bool Cancelled { get; init; }
        public long Total { get; init; }
        public string? ProcedureType { get; init; }
        public string? ContractType { get; init; }
        public int? OffersReceived { get; init; }

        public IReadOnlyList<string> Signals() =>
            Application.Items.Signals.Of(Kind, ProcedureType, ContractType, OffersReceived, AmountEur);

        public OrganisationRef? Organisation() =>
            OrganisationId is null ? null : new OrganisationRef(OrganisationId, OrganisationName ?? OrganisationId);

        public ItemSummary ToSummary() => new(
            SourceId, Source, Kind, Title, Organisation(), AmountEur, Utc(PublishedAt),
            DeadlineAt is { } deadline ? Utc(deadline) : null, NutsCode, CpvCodes, Cancelled, AmountWithVatEur, Signals());
    }

    internal sealed class DetailRow : SummaryRow
    {
        public long Id { get; init; }
        public string? Description { get; init; }
        public DateTime? SignedOn { get; init; }
        public DateTime? StartsOn { get; init; }
        public DateTime? EndsOn { get; init; }
        public DateTime? CancelledOn { get; init; }
        public string? SupersededBy { get; init; }
        public string? Procedure { get; init; }
    }

    internal sealed record CodeLabelRow(string Code, string? LabelEl, string? LabelEn)
    {
        public CodeLabel ToCodeLabel() => new(Code, LabelEl, LabelEn);
    }

    internal sealed record ContractorRow(string Name, string Role, decimal? AmountEur, string? CountryCode);

    internal sealed record LinkRow(string Relation, string ToSource, string ToSourceId, string? Kind, string? Title);
}
