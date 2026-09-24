namespace IxnosData.Application.Sitemap;

public sealed record SitemapIndex(int ItemPages)
{
    // The protocol's limit per file.
    public const int PageSize = 50_000;
}

public sealed record SitemapEntry(string Id, DateTimeOffset UpdatedAt);
