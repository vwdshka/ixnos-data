using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace IxnosData.Api.OpenApi;

internal sealed class DocumentInfoTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(
        OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.Info = new OpenApiInfo
        {
            Title = "ixnos-data API",
            Version = "v1",
            Description = """
                Search Greek public procurement and spending data from ΚΗΜΔΗΣ and Διαύγεια.

                **Rate limits.** Without a key, 120 requests a minute per IP address. With an API key
                (free: sign in on the website, then create one on the alerts page), send it as the
                `X-Api-Key` header for 600 requests a minute. Over the limit: HTTP 429.

                **Bulk data.** Daily exports of every record (CSV and JSON Lines) are at /exports/.

                **Sources and licence.** ΚΗΜΔΗΣ and Διαύγεια open data, both CC BY 4.0: credit the
                sources when you reuse the data.
                """,
            License = new OpenApiLicense
            {
                Name = "AGPL-3.0",
                Url = new Uri("https://www.gnu.org/licenses/agpl-3.0.html"),
            },
        };
        return Task.CompletedTask;
    }
}
