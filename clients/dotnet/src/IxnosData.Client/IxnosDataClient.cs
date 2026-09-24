using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace IxnosData.Client;

/// <summary>
/// The ixnos-data public API. Without an API key requests share the per-address limit; a free
/// key (created on the account page) has its own.
/// </summary>
public sealed class IxnosDataClient : IDisposable
{
    private const int PageLimit = 10_000;
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;

    /// <summary>Uses <paramref name="http"/>, whose <see cref="HttpClient.BaseAddress"/> must be the API's address.</summary>
    public IxnosDataClient(HttpClient http, string? apiKey = null)
    {
        ArgumentNullException.ThrowIfNull(http);
        if (http.BaseAddress is null)
        {
            throw new ArgumentException("The HttpClient needs a BaseAddress: the API's address.", nameof(http));
        }

        _http = http;
        if (apiKey is not null)
        {
            _http.DefaultRequestHeaders.Add("X-Api-Key", apiKey);
        }
    }

    /// <summary>Creates its own <see cref="HttpClient"/> for the API at <paramref name="baseAddress"/>.</summary>
    public IxnosDataClient(Uri baseAddress, string? apiKey = null)
        : this(new HttpClient { BaseAddress = baseAddress }, apiKey) => _ownsHttp = true;

    /// <summary>One page of search results.</summary>
    public async Task<SearchResult> SearchAsync(SearchOptions options, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);
        return (await GetAsync($"v1/search?{options.ToQueryString()}", ClientJson.Default.SearchResult, cancellationToken).ConfigureAwait(false))!;
    }

    /// <summary>
    /// Every result of a search, page by page (100 at a time), up to the API's limit of 10,000.
    /// </summary>
    public async IAsyncEnumerable<ItemSummary> SearchAllAsync(
        SearchOptions options, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);
        const int pageSize = 100;
        for (var page = 1; ; page++)
        {
            var result = await SearchAsync(options with { Page = page, PageSize = pageSize }, cancellationToken).ConfigureAwait(false);
            foreach (var item in result.Items)
            {
                yield return item;
            }

            if (result.Items.Count < pageSize || (long)page * pageSize >= Math.Min(result.Total, PageLimit))
            {
                yield break;
            }
        }
    }

    /// <summary>A record by its ΑΔΑΜ (ΚΗΜΔΗΣ) or ΑΔΑ (Διαύγεια), or null.</summary>
    public Task<ItemDetail?> GetItemAsync(string sourceId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceId);
        return GetAsync($"v1/items/{Uri.EscapeDataString(sourceId)}", ClientJson.Default.ItemDetail, cancellationToken);
    }

    /// <summary>A contracting authority by id, or null.</summary>
    public Task<OrganisationDetail?> GetOrganisationAsync(string id, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return GetAsync($"v1/organisations/{Uri.EscapeDataString(id)}", ClientJson.Default.OrganisationDetail, cancellationToken);
    }

    /// <summary>CPV codes matching a label (Greek or English) or a code prefix; at least 2 characters.</summary>
    public async Task<IReadOnlyList<CodeLabel>> FindCpvAsync(string query, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(query);
        return (await GetAsync($"v1/cpv?q={Uri.EscapeDataString(query)}", ClientJson.Default.IReadOnlyListCodeLabel, cancellationToken).ConfigureAwait(false))!;
    }

    /// <summary>When each source was last refreshed.</summary>
    public async Task<DataStatus> GetStatusAsync(CancellationToken cancellationToken = default) =>
        (await GetAsync("v1/status", ClientJson.Default.DataStatus, cancellationToken).ConfigureAwait(false))!;

    /// <inheritdoc />
    public void Dispose()
    {
        if (_ownsHttp)
        {
            _http.Dispose();
        }
    }

    private async Task<T?> GetAsync<T>(string path, JsonTypeInfo<T> type, CancellationToken cancellationToken)
    {
        using var response = await _http.GetAsync(new Uri(path, UriKind.Relative), cancellationToken).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return default;
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            throw new IxnosDataException(response.StatusCode, body);
        }

        return await response.Content.ReadFromJsonAsync(type, cancellationToken).ConfigureAwait(false);
    }
}

// Source-generated serialisation: works in trimmed and native AOT apps, which disable reflection.
[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(SearchResult))]
[JsonSerializable(typeof(ItemDetail))]
[JsonSerializable(typeof(OrganisationDetail))]
[JsonSerializable(typeof(IReadOnlyList<CodeLabel>))]
[JsonSerializable(typeof(DataStatus))]
internal sealed partial class ClientJson : JsonSerializerContext;
