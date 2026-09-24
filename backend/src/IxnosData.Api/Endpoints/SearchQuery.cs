using IxnosData.Application.Search;
using Microsoft.AspNetCore.Mvc;

namespace IxnosData.Api.Endpoints;

// The /v1/search query string is bound here so Application needs no ASP.NET attributes.
public sealed record SearchQuery(
    [property: FromQuery(Name = "q")] string? Q,
    [property: FromQuery(Name = "kind")] string[]? Kind,
    [property: FromQuery(Name = "cpv")] string? Cpv,
    [property: FromQuery(Name = "nuts")] string? Nuts,
    [property: FromQuery(Name = "organisation")] string? Organisation,
    [property: FromQuery(Name = "minAmount")] decimal? MinAmount,
    [property: FromQuery(Name = "maxAmount")] decimal? MaxAmount,
    [property: FromQuery(Name = "from")] DateOnly? From,
    [property: FromQuery(Name = "to")] DateOnly? To,
    [property: FromQuery(Name = "page")] int? Page,
    [property: FromQuery(Name = "pageSize")] int? PageSize,
    [property: FromQuery(Name = "sort")] string? Sort,
    [property: FromQuery(Name = "signal")] string? Signal)
{
    public SearchItemsRequest ToRequest() =>
        new(Q, Kind, Cpv, Nuts, Organisation, MinAmount, MaxAmount, From, To, Page, PageSize, Sort, Signal);
}
