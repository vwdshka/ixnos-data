using System.Text.Encodings.Web;
using System.Text.Json.Serialization;
using System.Text.Unicode;
using IxnosData.Api.Endpoints;
using IxnosData.Api.Errors;
using IxnosData.Api.OpenApi;
using IxnosData.Api.RateLimiting;
using IxnosData.Application;
using IxnosData.Infrastructure;
using IxnosData.Infrastructure.Persistence;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// IXNOS_DATA_ConnectionStrings__IxnosData -> ConnectionStrings:IxnosData, and so on.
builder.Configuration.AddEnvironmentVariables(prefix: "IXNOS_DATA_");

// Error tracking: off unless IXNOS_DATA_Sentry__Dsn is set. No request bodies or personal data.
builder.WebHost.UseSentry(options =>
{
    options.Dsn = builder.Configuration["Sentry:Dsn"] ?? string.Empty; // empty = off; null would throw
    options.SendDefaultPii = false;
});

builder.Services.AddOpenApi(options => options.AddDocumentTransformer<DocumentInfoTransformer>());
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<QueryTimeoutHandler>();
builder.Services.AddOutputCache();
builder.Services.AddApplication();
builder.Services.AddInfrastructure();
builder.Services.AddPublicRateLimit(builder.Configuration);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    // Write Greek as-is rather than as \u escapes, so responses stay readable.
    options.SerializerOptions.Encoder = JavaScriptEncoder.Create(UnicodeRanges.All);
    // Numbers are always written as numbers, so the contract types them as numbers only.
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});

var app = builder.Build();

// Production applies migrations before serving (one API instance; EF Core takes a lock).
if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<IxnosDataDbContext>();
    // A migration may rewrite every record (a backfill); normal requests keep the default.
    db.Database.SetCommandTimeout(TimeSpan.FromMinutes(10));
    await db.Database.MigrateAsync();
}

// Behind Caddy: take the client's address from X-Forwarded-For, or every visitor would share
// one rate limit. In production the API is reachable only through Caddy, so the header is trusted.
var forwarded = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto };
forwarded.KnownIPNetworks.Clear();
forwarded.KnownProxies.Clear();
app.UseForwardedHeaders(forwarded);

app.UseExceptionHandler();
app.UseApiKeys();
app.UseRateLimiter();
app.UseOutputCache();

// Public: the OpenAPI document at /openapi/v1.json and readable docs at /docs.
app.MapApiDocs();

// Liveness: the process is up. Readiness: it can also reach the database.
app.MapHealthChecks("/health", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });
// Ingestion alarms, for the external uptime monitor: 503 when a source is failing or quiet.
app.MapHealthChecks("/health/ingestion", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ingestion") });

app.MapGroup("/v1")
    .WithTags("Public")
    .RequireRateLimiting(PublicRateLimit.Policy)
    .MapPublicEndpoints()
    .MapAccountEndpoints();

app.Run();

// Exposed for WebApplicationFactory in IxnosData.Api.IntegrationTests.
public partial class Program;
