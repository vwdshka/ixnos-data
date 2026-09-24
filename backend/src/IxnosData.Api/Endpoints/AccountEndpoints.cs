using IxnosData.Api.RateLimiting;
using IxnosData.Application.Accounts;
using IxnosData.Domain.Users;
using Microsoft.AspNetCore.Http.HttpResults;

namespace IxnosData.Api.Endpoints;

// Signed-in endpoints expect "Authorization: Bearer <session>". The web app keeps the session in an
// HTTP-only cookie.
public static class AccountEndpoints
{
    public static RouteGroupBuilder MapAccountEndpoints(this RouteGroupBuilder v1)
    {
        v1.MapPost("/auth/login", RequestLoginAsync)
            .RequireRateLimiting(PublicRateLimit.SignInPolicy)
            .WithName("RequestLogin")
            .WithSummary("Email a one-time sign-in link (always accepted; never reveals whether an account exists)");

        v1.MapPost("/auth/verify", VerifyAsync)
            .WithName("VerifyLogin")
            .WithSummary("Exchange a sign-in link's token for a session token");

        var me = v1.MapGroup("/me").AddEndpointFilter(RequireSession);
        me.MapPost("/logout", LogoutAsync).WithName("Logout").WithSummary("End this session");
        me.MapGet("/", GetAccountAsync).WithName("GetAccount").WithSummary("The signed-in account and its saved searches");
        me.MapDelete("/", DeleteAccountAsync).WithName("DeleteAccount").WithSummary("Delete the account and everything linked to it");
        me.MapPut("/digest", SetDigestAsync).WithName("SetDigest").WithSummary("Choose how often alerts are emailed: daily, weekly or paused");
        me.MapPost("/saved-searches", SaveSearchAsync).WithName("SaveSearch").WithSummary("Save a search for daily alerts");
        me.MapDelete("/saved-searches/{id:guid}", DeleteSearchAsync).WithName("DeleteSavedSearch").WithSummary("Stop alerts for a saved search");
        me.MapGet("/api-keys", ListKeysAsync).WithName("ListApiKeys").WithSummary("The account's active API keys (without the keys themselves)");
        me.MapPost("/api-keys", CreateKeyAsync).WithName("CreateApiKey").WithSummary("Create an API key; the key is returned once");
        me.MapDelete("/api-keys/{id:guid}", RevokeKeyAsync).WithName("RevokeApiKey").WithSummary("Revoke an API key");
        return v1;
    }

    private const string UserKey = "ixnos-data.user";

    private static async ValueTask<object?> RequireSession(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var header = http.Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ", StringComparison.Ordinal) ? header["Bearer ".Length..].Trim() : null;
        var user = string.IsNullOrEmpty(token)
            ? null
            : await http.RequestServices.GetRequiredService<AccountHandler>().UserForSessionAsync(token, http.RequestAborted);
        if (user is null)
        {
            return TypedResults.Unauthorized();
        }

        http.Items[UserKey] = user;
        return await next(context);
    }

    private static UserAccount CurrentUser(HttpContext http) => (UserAccount)http.Items[UserKey]!;

    private static string SessionToken(HttpContext http) => http.Request.Headers.Authorization.ToString()["Bearer ".Length..].Trim();

    private static async Task<Results<Accepted, ValidationProblem>> RequestLoginAsync(
        LoginRequest request, AccountHandler accounts, CancellationToken cancellationToken) =>
        await accounts.RequestLoginAsync(request, cancellationToken)
            ? TypedResults.Accepted((string?)null)
            : TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Not a valid email address."] });

    private static async Task<Results<Ok<SessionResult>, BadRequest>> VerifyAsync(
        VerifyRequest request, AccountHandler accounts, CancellationToken cancellationToken) =>
        await accounts.VerifyAsync(request, cancellationToken) is { } session
            ? TypedResults.Ok(session)
            : TypedResults.BadRequest();

    private static async Task<NoContent> LogoutAsync(HttpContext http, AccountHandler accounts, CancellationToken cancellationToken)
    {
        await accounts.LogoutAsync(SessionToken(http), cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Ok<AccountView>> GetAccountAsync(HttpContext http, AccountHandler accounts, CancellationToken cancellationToken) =>
        TypedResults.Ok(await accounts.GetAsync(CurrentUser(http), cancellationToken));

    private static async Task<NoContent> DeleteAccountAsync(HttpContext http, AccountHandler accounts, CancellationToken cancellationToken)
    {
        await accounts.DeleteAsync(CurrentUser(http), cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, ValidationProblem>> SetDigestAsync(
        DigestSettingsRequest request, HttpContext http, AccountHandler accounts, CancellationToken cancellationToken) =>
        await accounts.SetDigestAsync(CurrentUser(http), request, cancellationToken)
            ? TypedResults.NoContent()
            : TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["frequency"] = [$"One of: {string.Join(", ", DigestFrequency.All)}."],
            });

    private static async Task<Results<Created<SavedSearchView>, ValidationProblem>> SaveSearchAsync(
        SavedSearchRequest request, HttpContext http, AccountHandler accounts, CancellationToken cancellationToken)
    {
        var (saved, errors) = await accounts.SaveSearchAsync(CurrentUser(http), request, cancellationToken);
        return saved is not null
            ? TypedResults.Created($"/v1/me/saved-searches/{saved.Id}", saved)
            : TypedResults.ValidationProblem(errors!);
    }

    private static async Task<Results<NoContent, NotFound>> DeleteSearchAsync(
        Guid id, HttpContext http, AccountHandler accounts, CancellationToken cancellationToken) =>
        await accounts.DeleteSearchAsync(CurrentUser(http), id, cancellationToken)
            ? TypedResults.NoContent()
            : TypedResults.NotFound();

    private static async Task<Ok<IReadOnlyList<ApiKeyView>>> ListKeysAsync(
        HttpContext http, ApiKeyHandler keys, CancellationToken cancellationToken) =>
        TypedResults.Ok(await keys.ListAsync(CurrentUser(http), cancellationToken));

    private static async Task<Results<Created<CreatedApiKey>, ValidationProblem>> CreateKeyAsync(
        ApiKeyRequest request, HttpContext http, ApiKeyHandler keys, CancellationToken cancellationToken) =>
        await keys.CreateAsync(CurrentUser(http), request, cancellationToken) is { } created
            ? TypedResults.Created($"/v1/me/api-keys/{created.ApiKey.Id}", created)
            : TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["apiKeys"] = [$"At most {ApiKeyHandler.MaxActiveKeys} active keys per account."],
            });

    private static async Task<Results<NoContent, NotFound>> RevokeKeyAsync(
        Guid id, HttpContext http, ApiKeyHandler keys, CancellationToken cancellationToken) =>
        await keys.RevokeAsync(CurrentUser(http), id, cancellationToken)
            ? TypedResults.NoContent()
            : TypedResults.NotFound();
}
