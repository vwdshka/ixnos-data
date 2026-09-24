using IxnosData.Application.Items;
using IxnosData.Application.Organisations;
using IxnosData.Application.Search;

namespace IxnosData.Application.Abstractions;

public interface IItemQueries
{
    Task<SearchItemsResult> SearchAsync(SearchCriteria criteria, CancellationToken cancellationToken);

    Task<ItemDetail?> GetAsync(string sourceId, CancellationToken cancellationToken);
}

public interface IOrganisationQueries
{
    Task<OrganisationDetail?> GetAsync(string id, CancellationToken cancellationToken);
}

public interface IReferenceQueries
{
    Task<IReadOnlyList<CodeLabel>> FindCpvAsync(string text, CancellationToken cancellationToken);
}

public interface IStatusQueries
{
    Task<Operations.DataStatus> GetAsync(CancellationToken cancellationToken);

    Task<Operations.PublicMetrics> GetMetricsAsync(CancellationToken cancellationToken);
}

public interface ISitemapQueries
{
    Task<Sitemap.SitemapIndex> GetIndexAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<Sitemap.SitemapEntry>> GetItemsAsync(int page, CancellationToken cancellationToken);

    Task<IReadOnlyList<Sitemap.SitemapEntry>> GetOrganisationsAsync(CancellationToken cancellationToken);
}
