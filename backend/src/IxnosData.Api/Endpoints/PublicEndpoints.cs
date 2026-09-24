using IxnosData.Application.Abstractions;
using IxnosData.Application.Items;
using IxnosData.Application.Organisations;
using IxnosData.Application.Search;
using IxnosData.Application.Sitemap;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace IxnosData.Api.Endpoints;

public static class PublicEndpoints
{
    public static RouteGroupBuilder MapPublicEndpoints(this RouteGroupBuilder v1)
    {
        v1.MapGet("/search", SearchAsync)
            .CacheOutput(Cached)
            .WithName("SearchItems")
            .WithSummary("Search records")
            .WithDescription(
                "Full-text search in Greek (accents and case ignored, words stemmed), typo-tolerant, "
                + "Greeklish-aware, with filters. An ΑΔΑΜ or ΑΔΑ finds that record; a nine-digit VAT "
                + "number finds records of that organisation or contractor.");

        v1.MapGet("/items/{sourceId}", GetItemAsync)
            .CacheOutput(Cached)
            .WithName("GetItem")
            .WithSummary("Get one record by its ΑΔΑΜ (ΚΗΜΔΗΣ) or ΑΔΑ (Διαύγεια)");

        v1.MapGet("/organisations/{id}", GetOrganisationAsync)
            .CacheOutput(Cached)
            .WithName("GetOrganisation")
            .WithSummary("Get a contracting authority with its activity and recent records");

        v1.MapGet("/cpv", FindCpvAsync)
            .CacheOutput(Cached)
            .WithName("FindCpv")
            .WithSummary("Find CPV codes by label (Greek or English) or code prefix")
            .WithDescription("For picking a trade: at most 12 codes, broad categories first. Needs at least 2 characters.");

        v1.MapGet("/status", (IStatusQueries status, CancellationToken ct) => status.GetAsync(ct))
            .CacheOutput(Cached)
            .WithName("GetStatus")
            .WithSummary("When the data was last refreshed from each source");

        v1.MapGet("/metrics", (IStatusQueries status, CancellationToken ct) => status.GetMetricsAsync(ct))
            .CacheOutput(Cached)
            .WithName("GetMetrics")
            .WithSummary("Public metrics: records per source, ingestion lag and runs, and usage totals");

        v1.MapGet("/sitemap", (ISitemapQueries sitemap, CancellationToken ct) => sitemap.GetIndexAsync(ct))
            .WithName("GetSitemapIndex")
            .WithSummary("How many pages of record identifiers the sitemap has");

        v1.MapGet(
                "/sitemap/items/{page:int}",
                (int page, ISitemapQueries sitemap, CancellationToken ct) => sitemap.GetItemsAsync(Math.Max(page, 0), ct))
            .WithName("GetSitemapItems")
            .WithSummary($"Record identifiers for search engines, {SitemapIndex.PageSize} per page");

        v1.MapGet("/sitemap/organisations", (ISitemapQueries sitemap, CancellationToken ct) => sitemap.GetOrganisationsAsync(ct))
            .WithName("GetSitemapOrganisations")
            .WithSummary("Identifiers of organisations that have records");

        return v1;
    }

    // The data changes hourly: a minute of caching makes repeating the same (possibly expensive)
    // request cost nothing, whoever sends it.
    private static void Cached(OutputCachePolicyBuilder policy) =>
        policy.Expire(TimeSpan.FromMinutes(1)).SetVaryByQuery("*");

    private static async Task<Results<Ok<SearchItemsResult>, ValidationProblem>> SearchAsync(
        [AsParameters] SearchQuery query, SearchItemsHandler handler, CancellationToken cancellationToken)
    {
        var outcome = await handler.HandleAsync(query.ToRequest(), cancellationToken);
        return outcome.Result is { } result
            ? TypedResults.Ok(result)
            : TypedResults.ValidationProblem(outcome.Errors ?? new Dictionary<string, string[]>());
    }

    private static async Task<IReadOnlyList<CodeLabel>> FindCpvAsync(
        [FromQuery] string? q, IReferenceQueries reference, CancellationToken cancellationToken) =>
        q is { Length: >= 2 and <= 100 } ? await reference.FindCpvAsync(q, cancellationToken) : [];

    private static async Task<Results<Ok<ItemDetail>, NotFound>> GetItemAsync(
        string sourceId, GetItemHandler handler, CancellationToken cancellationToken) =>
        await handler.HandleAsync(sourceId, cancellationToken) is { } item
            ? TypedResults.Ok(item)
            : TypedResults.NotFound();

    private static async Task<Results<Ok<OrganisationDetail>, NotFound>> GetOrganisationAsync(
        string id, GetOrganisationHandler handler, CancellationToken cancellationToken) =>
        await handler.HandleAsync(id, cancellationToken) is { } organisation
            ? TypedResults.Ok(organisation)
            : TypedResults.NotFound();
}
