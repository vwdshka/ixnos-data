using System.Net;
using System.Text;
using System.Text.Json;

namespace IxnosData.Client.Tests;

public class ClientTests
{
    // Answers every request with the next canned response and remembers what was asked.
    private sealed class FakeApi(params (HttpStatusCode Status, string Body)[] responses) : HttpMessageHandler
    {
        private int _next;

        public List<HttpRequestMessage> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            var (status, body) = responses[Math.Min(_next++, responses.Length - 1)];
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    private static IxnosDataClient Client(FakeApi api, string? key = null) =>
        new(new HttpClient(api) { BaseAddress = new Uri("https://api.example.org/") }, key);

    private static string Page(int total, int count, int start = 0) => JsonSerializer.Serialize(new
    {
        total,
        page = 1,
        pageSize = 100,
        mode = "text",
        totalCapped = false,
        items = Enumerable.Range(start, count).Select(i => new
        {
            sourceId = $"26PROC{i:D9}",
            source = "khmdhs",
            kind = "notice",
            title = "ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ",
            organisation = new { id = "99221070", name = "ΔΗΜΟΣ ΙΩΑΝΝΙΤΩΝ" },
            amountEur = 12000.5,
            publishedAt = "2026-09-20T08:00:00+00:00",
            deadlineAt = (string?)null,
            nutsCode = "EL543",
            cpvCodes = new[] { "33600000-6" },
            cancelled = false,
            amountWithVatEur = (decimal?)null,
            signals = new[] { "single_offer" },
            amountImplausible = false,
        }),
    });

    [Fact]
    public async Task SearchSendsEncodedFiltersAndTheApiKey()
    {
        var api = new FakeApi((HttpStatusCode.OK, Page(1, 1)));
        using var client = Client(api, "ixn_test");

        var result = await client.SearchAsync(new SearchOptions
        {
            Query = "φάρμακα ιωάννινα",
            Kinds = ["notice", "award"],
            MinAmount = 1500.5m,
            From = new DateOnly(2026, 1, 31),
        });

        var request = Assert.Single(api.Requests);
        Assert.Equal(
            "/v1/search?q=%CF%86%CE%AC%CF%81%CE%BC%CE%B1%CE%BA%CE%B1%20%CE%B9%CF%89%CE%AC%CE%BD%CE%BD%CE%B9%CE%BD%CE%B1&kind=notice&kind=award&minAmount=1500.5&from=2026-01-31",
            request.RequestUri!.PathAndQuery);
        Assert.Equal("ixn_test", Assert.Single(request.Headers.GetValues("X-Api-Key")));
        var item = Assert.Single(result.Items);
        Assert.Equal(("ΔΗΜΟΣ ΙΩΑΝΝΙΤΩΝ", 12000.5m, "single_offer"), (item.Organisation?.Name, item.AmountEur, item.Signals?.Single()));
    }

    [Fact]
    public async Task SearchAllPagesUntilTheLastResult()
    {
        var api = new FakeApi((HttpStatusCode.OK, Page(250, 100)), (HttpStatusCode.OK, Page(250, 100, 100)), (HttpStatusCode.OK, Page(250, 50, 200)));
        using var client = Client(api);

        var items = new List<ItemSummary>();
        await foreach (var item in client.SearchAllAsync(new SearchOptions { Cpv = "33" }))
        {
            items.Add(item);
        }

        Assert.Equal(250, items.Select(i => i.SourceId).Distinct().Count());
        Assert.Equal(3, api.Requests.Count);
        Assert.EndsWith("page=3&pageSize=100", api.Requests[2].RequestUri!.Query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task UnknownRecordsAreNullAndRefusalsThrow()
    {
        var api = new FakeApi(
            (HttpStatusCode.NotFound, ""),
            (HttpStatusCode.BadRequest, """{"errors":{"kind":["Unknown kind(s): tender."]}}"""));
        using var client = Client(api);

        Assert.Null(await client.GetItemAsync("26PROC999999999"));
        var refused = await Assert.ThrowsAsync<IxnosDataException>(() => client.SearchAsync(new SearchOptions { Kinds = ["tender"] }));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("tender", refused.Body, StringComparison.Ordinal);
    }

    [Fact]
    public void AnHttpClientWithoutAnAddressIsRefused()
    {
        using var http = new HttpClient();

        Assert.Throws<ArgumentException>(() => new IxnosDataClient(http));
    }
}
