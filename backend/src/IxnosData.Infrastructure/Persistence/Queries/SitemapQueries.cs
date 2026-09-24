using Dapper;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Sitemap;
using Npgsql;

namespace IxnosData.Infrastructure.Persistence.Queries;

public sealed class SitemapQueries(NpgsqlDataSource dataSource) : ISitemapQueries
{
    public async Task<SitemapIndex> GetIndexAsync(CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var count = await connection.ExecuteScalarAsync<long>(new CommandDefinition(
            "SELECT count(*) FROM procurement_item", cancellationToken: cancellationToken));
        return new SitemapIndex((int)Math.Ceiling(count / (double)SitemapIndex.PageSize));
    }

    // Limit: OFFSET paging; switch to keyset on id if pages past a few million get slow.
    public Task<IReadOnlyList<SitemapEntry>> GetItemsAsync(int page, CancellationToken cancellationToken) =>
        QueryAsync(
            """
            SELECT source_id AS "Id", updated_at AS "UpdatedAt" FROM procurement_item
            ORDER BY id LIMIT @size OFFSET @offset
            """,
            new { size = SitemapIndex.PageSize, offset = (long)page * SitemapIndex.PageSize },
            cancellationToken);

    // Organisations with at least one record; the rest would be empty pages.
    public Task<IReadOnlyList<SitemapEntry>> GetOrganisationsAsync(CancellationToken cancellationToken) =>
        QueryAsync(
            """
            SELECT o.id AS "Id", o.updated_at AS "UpdatedAt" FROM organisation o
            WHERE EXISTS (SELECT 1 FROM procurement_item p WHERE p.organisation_id = o.id)
            ORDER BY o.id
            """,
            null,
            cancellationToken);

    private async Task<IReadOnlyList<SitemapEntry>> QueryAsync(string sql, object? parameters, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<(string Id, DateTime UpdatedAt)>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return [.. rows.Select(r => new SitemapEntry(r.Id, ItemQueries.Utc(r.UpdatedAt)))];
    }
}
