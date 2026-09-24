using IxnosData.Application;
using IxnosData.Application.Alerts;
using IxnosData.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

// Sends the daily alert digests once and exits; the host crontab runs it every morning. A
// separate process from the API, so a mail outage can never take the site down.
var builder = Host.CreateApplicationBuilder(args);
builder.Configuration.AddEnvironmentVariables(prefix: "IXNOS_DATA_");
builder.Logging.AddFilter("Microsoft", LogLevel.Warning); // not every SQL statement in the cron log
builder.Services.AddApplication();
builder.Services.AddInfrastructure();

// Error tracking: off unless IXNOS_DATA_Sentry__Dsn is set.
using var sentry = SentrySdk.Init(options => options.Dsn = builder.Configuration["Sentry:Dsn"] ?? string.Empty);
using var host = builder.Build();
await using var scope = host.Services.CreateAsyncScope();
var result = await scope.ServiceProvider.GetRequiredService<DigestHandler>().RunAsync(CancellationToken.None);

// One line per run, read from the cron log.
Console.WriteLine(
    $"Digest: {result.Users} users, {result.Emails} emails, {result.Records} records, {result.Failed} failed");
if (result.Failed > 0)
{
    SentrySdk.CaptureMessage($"Digest: {result.Failed} emails failed to send", SentryLevel.Error);
}

return result.Failed > 0 ? 1 : 0;
