using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using IxnosData.Api.IntegrationTests.Fixtures;
using IxnosData.Application.Abstractions;
using IxnosData.Application.Accounts;
using IxnosData.Application.Alerts;
using IxnosData.Application.Search;
using IxnosData.Domain.Items;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace IxnosData.Api.IntegrationTests.Accounts;

/// <summary>The whole Phase 2 loop: sign-in link, session, saved search, digest, deletion.</summary>
[Collection(PostgresTests.Name)]
public sealed partial class AccountFlowTests(PostgresFixture postgres)
{
    private sealed class FakeEmail : IEmailSender
    {
        public List<(string To, string Subject, string Text)> Sent { get; } = [];

        public Task SendAsync(string recipient, string subject, string text, string html, CancellationToken cancellationToken)
        {
            Sent.Add((recipient, subject, text));
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task SignInSaveSearchReceiveDigestAndDelete()
    {
        var email = new FakeEmail();
        await using var api = postgres.CreateApi().WithWebHostBuilder(host =>
            host.ConfigureTestServices(services => services.AddSingleton<IEmailSender>(email)));
        using var client = api.CreateClient();

        // A sign-in link arrives by email; using it gives a session, and it works only once.
        var login = await client.PostAsJsonAsync("/v1/auth/login", new LoginRequest("Reader@Example.org", "en"));
        Assert.Equal(HttpStatusCode.Accepted, login.StatusCode);
        var (to, _, text) = Assert.Single(email.Sent);
        Assert.Equal("reader@example.org", to);
        var token = LinkToken().Match(text).Groups[1].Value;

        var verify = await client.PostAsJsonAsync("/v1/auth/verify", new VerifyRequest(token));
        var session = await verify.Content.ReadFromJsonAsync<SessionResult>();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/v1/auth/verify", new VerifyRequest(token))).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(new Uri("/v1/me", UriKind.Relative))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!.SessionToken);

        // Save a search, then a matching record arrives.
        var save = await client.PostAsJsonAsync("/v1/me/saved-searches", new SavedSearchRequest(null, "αλεξίπτωτα", null, null, null, null, null));
        Assert.Equal(HttpStatusCode.Created, save.StatusCode);
        await using (var db = postgres.CreateDbContext())
        {
            db.ProcurementItems.Add(new ProcurementItem
            {
                Source = "khmdhs",
                SourceId = "26PROC000009901",
                Kind = ItemKind.Notice,
                Title = "ΠΡΟΜΗΘΕΙΑ ΑΛΕΞΙΠΤΩΤΩΝ",
                TextNormalised = GreekText.Normalise("ΠΡΟΜΗΘΕΙΑ ΑΛΕΞΙΠΤΩΤΩΝ"),
                SearchKey = GreekText.SearchKey("ΠΡΟΜΗΘΕΙΑ ΑΛΕΞΙΠΤΩΤΩΝ"),
                CpvCodes = ["35000000-4"],
                PublishedAt = DateTimeOffset.UtcNow,
                Raw = "{}",
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        // The digest sends it once; a second run sends nothing new.
        email.Sent.Clear();
        await RunDigestAsync(api);
        await RunDigestAsync(api);
        var digest = Assert.Single(email.Sent);
        Assert.Contains("ΠΡΟΜΗΘΕΙΑ ΑΛΕΞΙΠΤΩΤΩΝ", digest.Text, StringComparison.Ordinal);
        Assert.Contains("/en/items/26PROC000009901", digest.Text, StringComparison.Ordinal);

        // Deleting the account ends the session and removes the saved search.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(new Uri("/v1/me", UriKind.Relative))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(new Uri("/v1/me", UriKind.Relative))).StatusCode);
        await using var check = postgres.CreateDbContext();
        Assert.Empty(check.SavedSearches.Where(s => s.Query == "αλεξίπτωτα"));
    }

    [Fact]
    public async Task PausedDigestsSendNothingAndResumeWithoutABacklog()
    {
        var email = new FakeEmail();
        await using var api = postgres.CreateApi().WithWebHostBuilder(host =>
            host.ConfigureTestServices(services => services.AddSingleton<IEmailSender>(email)));
        using var client = api.CreateClient();
        await client.PostAsJsonAsync("/v1/auth/login", new LoginRequest("paused@example.org", "el"));
        var token = LinkToken().Match(Assert.Single(email.Sent).Text).Groups[1].Value;
        var session = await (await client.PostAsJsonAsync("/v1/auth/verify", new VerifyRequest(token))).Content.ReadFromJsonAsync<SessionResult>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!.SessionToken);
        await client.PostAsJsonAsync("/v1/me/saved-searches", new SavedSearchRequest(null, "τραμπολίνα", null, null, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/v1/me/digest", new DigestSettingsRequest("hourly"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/v1/me/digest", new DigestSettingsRequest("paused"))).StatusCode);
        Assert.Equal("paused", (await client.GetFromJsonAsync<AccountView>(new Uri("/v1/me", UriKind.Relative)))!.DigestFrequency);
        await using (var db = postgres.CreateDbContext())
        {
            db.ProcurementItems.Add(new ProcurementItem
            {
                Source = "khmdhs",
                SourceId = "26PROC000009902",
                Kind = ItemKind.Notice,
                Title = "ΠΡΟΜΗΘΕΙΑ ΤΡΑΜΠΟΛΙΝΩΝ",
                TextNormalised = GreekText.Normalise("ΠΡΟΜΗΘΕΙΑ ΤΡΑΜΠΟΛΙΝΩΝ"),
                SearchKey = GreekText.SearchKey("ΠΡΟΜΗΘΕΙΑ ΤΡΑΜΠΟΛΙΝΩΝ"),
                CpvCodes = ["37000000-8"],
                PublishedAt = DateTimeOffset.UtcNow,
                Raw = "{}",
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        email.Sent.Clear();
        await RunDigestAsync(api);
        await client.PutAsJsonAsync("/v1/me/digest", new DigestSettingsRequest("daily"));
        await RunDigestAsync(api);

        Assert.DoesNotContain(email.Sent, sent => sent.To == "paused@example.org");
    }

    [Fact]
    public async Task SignInRequestsHaveTheirOwnLowLimitPerAddress()
    {
        var email = new FakeEmail();
        await using var api = postgres.CreateApi().WithWebHostBuilder(host =>
            host.ConfigureTestServices(services => services.AddSingleton<IEmailSender>(email)));
        using var client = api.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 6; i++)
        {
            var response = await client.PostAsJsonAsync("/v1/auth/login", new LoginRequest($"stranger{i}@example.org", "en"));
            statuses.Add(response.StatusCode);
        }

        Assert.All(statuses.Take(5), status => Assert.True(status < HttpStatusCode.BadRequest, $"got {status}"));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[5]);
        // Searching is not affected by sign-in attempts.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(new Uri("/v1/search?q=test", UriKind.Relative))).StatusCode);
    }

    [Fact]
    public async Task ApiKeysGetTheirOwnLimitAndUnknownKeysAreRefused()
    {
        var email = new FakeEmail();
        await using var api = postgres.CreateApi().WithWebHostBuilder(host =>
            host.ConfigureTestServices(services => services.AddSingleton<IEmailSender>(email)));
        using var client = api.CreateClient();
        await client.PostAsJsonAsync("/v1/auth/login", new LoginRequest("developer@example.org", "en"));
        var token = LinkToken().Match(Assert.Single(email.Sent).Text).Groups[1].Value;
        var session = await (await client.PostAsJsonAsync("/v1/auth/verify", new VerifyRequest(token))).Content.ReadFromJsonAsync<SessionResult>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!.SessionToken);

        var created = await (await client.PostAsJsonAsync("/v1/me/api-keys", new ApiKeyRequest("scraper"))).Content.ReadFromJsonAsync<CreatedApiKey>();
        Assert.StartsWith("ixn_", created!.Key, StringComparison.Ordinal);
        var listed = await client.GetFromJsonAsync<List<ApiKeyView>>(new Uri("/v1/me/api-keys", UriKind.Relative));
        Assert.Equal(created.Key[..12], Assert.Single(listed!).Prefix);

        using var anonymous = api.CreateClient();
        using var withKey = new HttpRequestMessage(HttpMethod.Get, "/v1/search?q=test");
        withKey.Headers.Add("X-Api-Key", created.Key);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.SendAsync(withKey)).StatusCode);
        using var badKey = new HttpRequestMessage(HttpMethod.Get, "/v1/search?q=test");
        badKey.Headers.Add("X-Api-Key", "ixn_not-a-key");
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(badKey)).StatusCode);

        // The hosted documentation and its OpenAPI document are public.
        Assert.Contains("api-reference", await anonymous.GetStringAsync(new Uri("/docs", UriKind.Relative)), StringComparison.Ordinal);
        Assert.Contains("X-Api-Key", await anonymous.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative)), StringComparison.Ordinal);
    }

    private static async Task RunDigestAsync(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> api)
    {
        await using var scope = api.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DigestHandler>().RunAsync(CancellationToken.None);
    }

    [GeneratedRegex(@"token=([A-Za-z0-9_-]+)")]
    private static partial Regex LinkToken();
}
