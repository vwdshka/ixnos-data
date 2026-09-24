using System.Threading.RateLimiting;
using IxnosData.Application.Accounts;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;

namespace IxnosData.Api.RateLimiting;

// A valid X-Api-Key gets that key's own limit; everyone else shares a per-IP one. A bad key gets a
// 401 rather than quietly falling back to the IP limit, so its owner notices.
public static class PublicRateLimit
{
    public const string Policy = "public";

    // Each sign-in request sends an email. Without its own limit, one address could make the
    // server email ~120 strangers a minute and ruin the sending domain's reputation.
    public const string SignInPolicy = "sign-in";
    public const string Header = "X-Api-Key";
    private const string GrantKey = "ixnos-data.apiKey";

    // Keys are looked up once a minute at most; a revoked key stops working within that minute.
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(1);

    public static IServiceCollection AddPublicRateLimit(this IServiceCollection services, IConfiguration configuration)
    {
        var permitsPerMinute = configuration.GetValue("RateLimiting:PermitsPerMinute", 120);
        services.AddMemoryCache();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(Policy, context => context.Items[GrantKey] is ApiKeyGrant grant
                ? RateLimitPartition.GetFixedWindowLimiter("key:" + grant.Id, _ => PerMinute(grant.PermitsPerMinute))
                : RateLimitPartition.GetFixedWindowLimiter(
                    "ip:" + ClientAddress(context), _ => PerMinute(permitsPerMinute)));
            options.AddPolicy(SignInPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                "sign-in:" + ClientAddress(context),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(15), QueueLimit = 0 }));
        });
        return services;
    }

    // Must run before UseRateLimiter.
    public static IApplicationBuilder UseApiKeys(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var key = context.Request.Headers[Header].ToString();
            if (key.Length > 0)
            {
                var cache = context.RequestServices.GetRequiredService<IMemoryCache>();
                var grant = await cache.GetOrCreateAsync("apikey:" + Tokens.Hash(key), entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = CacheFor;
                    return context.RequestServices.GetRequiredService<ApiKeyHandler>().ResolveAsync(key, context.RequestAborted);
                });
                if (grant is null)
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    await context.Response.WriteAsJsonAsync(new { title = "Unknown or revoked API key." });
                    return;
                }

                context.Items[GrantKey] = grant;
            }

            await next(context);
        });

    // After UseForwardedHeaders: the visitor's address as Caddy (or the web app) reported it.
    private static string ClientAddress(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static FixedWindowRateLimiterOptions PerMinute(int permits) => new()
    {
        PermitLimit = permits,
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
    };
}
