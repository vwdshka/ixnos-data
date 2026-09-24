namespace IxnosData.Api.OpenApi;

// /docs is Scalar over the live OpenAPI document. The script is the npm package's own file (not
// jsDelivr's on-the-fly minified one, whose bytes may change) with its hash, so a tampered copy
// is refused. Upgrading means a new version and a new hash:
//   curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A
public static class ApiDocs
{
    private const string Page = """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>ixnos-data API</title>
        </head>
        <body>
          <script id="api-reference" data-url="/openapi/v1.json"></script>
          <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.71.0/dist/browser/standalone.js"
                  integrity="sha384-I7aSmSxf06vl5HT10vzNOAryO+PFCAVHIGwhZerHn6yM/O0642381S3kw9o7fFQd"
                  crossorigin="anonymous"></script>
        </body>
        </html>
        """;

    public static IEndpointRouteBuilder MapApiDocs(this IEndpointRouteBuilder app)
    {
        app.MapOpenApi();
        app.MapGet("/docs", (HttpContext context) =>
        {
            // Only the pinned viewer from jsDelivr runs here; it reads the document from this API.
            context.Response.Headers.ContentSecurityPolicy =
                "default-src 'none'; script-src https://cdn.jsdelivr.net; connect-src 'self'; " +
                "style-src 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.scalar.com; " +
                "font-src https://fonts.scalar.com https://cdn.jsdelivr.net data:; img-src 'self' data: https:; " +
                "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
            return Results.Content(Page, "text/html");
        }).ExcludeFromDescription();
        return app;
    }
}
