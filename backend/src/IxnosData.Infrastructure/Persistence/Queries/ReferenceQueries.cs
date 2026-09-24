using Dapper;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Items;
using IxnosData.Application.Search;
using Npgsql;

namespace IxnosData.Infrastructure.Persistence.Queries;

public sealed class ReferenceQueries(NpgsqlDataSource dataSource) : IReferenceQueries
{
    public const int MaxCpvMatches = 12;

    // Labels in either language, or a code prefix. Labels with a word starting as typed come
    // before labels that only contain it, then broad categories before narrow ones. 9,454 rows:
    // a scan is fine.
    public async Task<IReadOnlyList<CodeLabel>> FindCpvAsync(string text, CancellationToken cancellationToken)
    {
        var query = text.Trim();
        var digits = new string(query.TakeWhile(char.IsAsciiDigit).ToArray());
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<CodeLabel>(new CommandDefinition(
            """
            SELECT code, label_el AS "LabelEl", label_en AS "LabelEn" FROM (
                SELECT *, ' ' || translate(lower(unaccent(label_el)), 'ς', 'σ') AS el, ' ' || lower(label_en) AS en
                FROM cpv_code) c
            WHERE (@digits <> '' AND starts_with(code, @digits))
               OR strpos(el, @normalised) > 0 OR strpos(en, lower(@query)) > 0
            ORDER BY (strpos(el, ' ' || @normalised) > 0 OR strpos(en, ' ' || lower(@query)) > 0) DESC, level, code
            LIMIT @limit
            """,
            new { query, normalised = GreekText.Normalise(query), digits, limit = MaxCpvMatches },
            cancellationToken: cancellationToken));
        return [.. rows];
    }
}
