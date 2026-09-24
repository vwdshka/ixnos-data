using System.Net;
using System.Net.Http.Json;
using IxnosData.Api.IntegrationTests.Fixtures;
using IxnosData.Application;
using IxnosData.Application.Items;
using IxnosData.Application.Organisations;
using IxnosData.Application.Search;
using IxnosData.Domain.Contractors;
using IxnosData.Domain.Items;
using IxnosData.Domain.Organisations;
using IxnosData.Domain.Reference;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Api.IntegrationTests.Search;

/// <summary>
/// The public API against PostgreSQL with a small, realistic data set. Every record belongs to
/// organisation "T-API", and searches filter on it, so other test classes sharing the database
/// cannot affect the results.
/// </summary>
[Collection(PostgresTests.Name)]
public sealed class PublicApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Org = "T-API";
    private const string SignalsOrg = "T-SIG";
    private HttpClient _client = null!;
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> _api = null!;

    public async Task InitializeAsync()
    {
        _api = postgres.CreateApi();
        _client = _api.CreateClient();
        await SeedAsync();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        return _api.DisposeAsync().AsTask();
    }

    private async Task SeedAsync()
    {
        await using var db = postgres.CreateDbContext();
        if (await db.Organisations.AnyAsync(o => o.Id == Org))
        {
            return;
        }

        db.Organisations.Add(new Organisation { Id = Org, NameEl = "ΔΗΜΟΣ ΔΟΚΙΜΩΝ", TaxId = "090114939", UpdatedAt = DateTimeOffset.UtcNow });
        db.CpvCodes.AddRange(
            new CpvCode { Code = "33000000-0", Level = 1, LabelEl = "Ιατρικός εξοπλισμός, φαρμακευτικά προϊόντα", LabelEn = "Medical equipments, pharmaceuticals" },
            new CpvCode { Code = "33600000-6", ParentCode = "33000000-0", Level = 2, LabelEl = "Φαρμακευτικά προϊόντα", LabelEn = "Pharmaceutical products" },
            new CpvCode { Code = "90000000-7", Level = 1, LabelEl = "Υπηρεσίες λυμάτων", LabelEn = "Sewage services" },
            new CpvCode { Code = "90910000-9", ParentCode = "90000000-7", Level = 3, LabelEl = "Υπηρεσίες καθαρισμού", LabelEn = "Cleaning services" });
        db.NutsRegions.Add(new NutsRegion { Code = "EL543", Level = 3, LabelEl = "Ιωάννινα", LabelEn = "Ioannina" });

        var notice = Item("26PROC000000101", ItemKind.Notice, "ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ ΓΙΑ ΤΟ ΚΕΝΤΡΟ ΥΓΕΙΑΣ", "33600000-6", 12_000m, "EL543");
        var award = Item("26AWRD000000102", ItemKind.Award, "ΑΝΑΘΕΣΗ ΠΡΟΜΗΘΕΙΑΣ ΦΑΡΜΑΚΩΝ", "33600000-6", 11_500m, "EL543");
        var cleaning = Item("26PROC000000103", ItemKind.Notice, "ΥΠΗΡΕΣΙΕΣ ΚΑΘΑΡΙΟΤΗΤΑΣ ΣΧΟΛΙΚΩΝ ΜΟΝΑΔΩΝ", "90910000-9", 80_000m, "EL30");
        // Διαύγεια: a payment to the award's winner (same VAT number, so the same contractor),
        // and a decision a correction replaced, which must stay out of results and totals.
        var payment = Item("ΨΠΛΗ46ΜΤΛ6-ΠΛΗ", ItemKind.Payment, "ΠΛΗΡΩΜΗ ΦΑΡΜΑΚΑΠΟΘΗΚΗΣ", "33600000-6", 0m, "EL543");
        payment.Source = "diavgeia";
        payment.AmountEur = null;
        payment.AmountWithVatEur = 14_260m;
        var replaced = Item("ΨΠΑΛ46ΜΤΛ6-ΠΑΛ", ItemKind.Payment, "ΠΛΗΡΩΜΗ ΦΑΡΜΑΚΑΠΟΘΗΚΗΣ ΠΑΛΙΑ", "33600000-6", 0m, "EL543");
        replaced.Source = "diavgeia";
        replaced.AmountEur = null;
        replaced.AmountWithVatEur = 99_999m;
        replaced.SupersededBy = payment.SourceId;
        db.ProcurementItems.AddRange(notice, award, cleaning, payment, replaced);
        var contractor = new Contractor { Name = "ΦΑΡΜΑΚΑΠΟΘΗΚΗ Α.Ε.", TaxId = "094014201" };
        db.Contractors.Add(contractor);
        await db.SaveChangesAsync();

        db.ItemContractors.AddRange(
            new ItemContractor { ItemId = award.Id, ContractorId = contractor.Id, Role = ContractorRole.Winner },
            new ItemContractor { ItemId = payment.Id, ContractorId = contractor.Id, Role = ContractorRole.Payee, AmountEur = 14_260m },
            new ItemContractor { ItemId = replaced.Id, ContractorId = contractor.Id, Role = ContractorRole.Payee, AmountEur = 99_999m });
        db.ItemLinks.AddRange(
            new ItemLink { FromItemId = award.Id, Relation = "notice", ToSource = "khmdhs", ToSourceId = notice.SourceId, ToItemId = notice.Id },
            new ItemLink { FromItemId = award.Id, Relation = "contract", ToSource = "khmdhs", ToSourceId = "26SYMV000000199" });
        await db.SaveChangesAsync();
        await SeedSignalsAsync(db);
    }

    // A second authority, so its records leave T-API's totals alone: an open procedure with one
    // offer, a direct award just under the 30,000 limit, and ten awards, six of them (60% of the
    // value) to one supplier.
    private static async Task SeedSignalsAsync(Infrastructure.Persistence.IxnosDataDbContext db)
    {
        db.Organisations.Add(new Organisation { Id = SignalsOrg, NameEl = "ΔΗΜΟΣ ΣΗΜΑΤΩΝ", UpdatedAt = DateTimeOffset.UtcNow });
        var singleOffer = Item("26SYMV000000104", ItemKind.Contract, "ΣΥΜΒΑΣΗ ΠΡΟΜΗΘΕΙΑΣ ΚΑΥΣΙΜΩΝ", "90910000-9", 0m, "EL30");
        (singleOffer.ProcedureType, singleOffer.OffersReceived, singleOffer.AmountEur) = ("1", 1, null);
        var nearLimit = Item("26SYMV000000105", ItemKind.Contract, "ΣΥΜΒΑΣΗ ΣΥΝΤΗΡΗΣΗΣ ΚΛΙΜΑΤΙΣΤΙΚΩΝ", "90910000-9", 29_800m, "EL30");
        nearLimit.ProcedureType = "6";
        var awards = Enumerable.Range(0, 10)
            .Select(i => Item($"26AWRD00000020{i}", ItemKind.Award, "ΑΝΑΘΕΣΗ ΥΠΗΡΕΣΙΩΝ ΚΑΘΑΡΙΣΜΟΥ", "90910000-9", 1_000m, "EL30"))
            .ToList();
        List<ProcurementItem> all = [singleOffer, nearLimit, .. awards];
        all.ForEach(item => item.OrganisationId = SignalsOrg);
        db.ProcurementItems.AddRange(all);
        var regular = new Contractor { Name = "ΚΑΘΑΡΙΣΜΟΙ Ο.Ε.", TaxId = "800000001" };
        var other = new Contractor { Name = "ΑΛΛΗ ΕΤΑΙΡΕΙΑ Ε.Ε.", TaxId = "800000002" };
        db.Contractors.AddRange(regular, other);
        await db.SaveChangesAsync();

        db.ItemContractors.AddRange(awards.Select((award, i) => new ItemContractor
        {
            ItemId = award.Id,
            ContractorId = i < 6 ? regular.Id : other.Id,
            Role = ContractorRole.Winner,
        }));
        await db.SaveChangesAsync();
    }

    private static ProcurementItem Item(
        string sourceId, ItemKind kind, string title, string cpv, decimal amount, string nuts) => new()
        {
            Source = "khmdhs",
            SourceId = sourceId,
            Kind = kind,
            Title = title,
            // As the pipeline writes them (same normaliser, same shared test cases).
            TextNormalised = GreekText.Normalise(title),
            SearchKey = GreekText.SearchKey(title),
            CpvCodes = [cpv],
            AmountEur = amount,
            NutsCode = nuts,
            OrganisationId = Org,
            PublishedAt = DateTimeOffset.UtcNow.AddDays(-1),
            Raw = "{}",
            UpdatedAt = DateTimeOffset.UtcNow,
        };

    private async Task<SearchItemsResult> SearchAsync(string query, string organisation = Org)
    {
        var result = await _client.GetFromJsonAsync<SearchItemsResult>(
            new Uri($"/v1/search?organisation={organisation}&{query}", UriKind.Relative));
        return result!;
    }

    [Theory]
    [InlineData("q=φάρμακα", "text")] // stemmed: φάρμακα ~ ΦΑΡΜΑΚΩΝ
    [InlineData("q=προμηθια%20φαρμακων", "text")] // typo and no accents
    [InlineData("q=promitheia%20farmakon", "greeklish")]
    public async Task FindsPharmacyRecordsHoweverTheyAreTyped(string query, string mode)
    {
        var result = await SearchAsync(query);

        Assert.Equal(mode, result.Mode);
        Assert.Contains(result.Items, item => item.SourceId == "26PROC000000101");
        Assert.DoesNotContain(result.Items, item => item.SourceId == "26PROC000000103");
    }

    [Fact]
    public async Task FiltersByKindCpvRegionAndAmount()
    {
        var awards = await SearchAsync("kind=award");
        var pharmacy = await SearchAsync("cpv=33");
        var ioannina = await SearchAsync("nuts=EL54");
        var large = await SearchAsync("minAmount=50000");

        Assert.Equal(["26AWRD000000102"], awards.Items.Select(i => i.SourceId));
        Assert.Equal(3, pharmacy.Total); // two ΚΗΜΔΗΣ records and the Διαύγεια payment
        Assert.Equal(3, ioannina.Total);
        Assert.Equal(["26PROC000000103"], large.Items.Select(i => i.SourceId));
    }

    [Theory]
    [InlineData("καθαρισμού", "90910000-9")] // Greek label, accent-insensitive
    [InlineData("ΚΑΘΑΡΙΣΜΟΥ", "90910000-9")]
    [InlineData("cleaning", "90910000-9")] // English label
    [InlineData("3360", "33600000-6")] // code prefix
    public async Task CpvCodesAreFoundByLabelOrCode(string query, string code)
    {
        var codes = await _client.GetFromJsonAsync<IxnosData.Application.Items.CodeLabel[]>(
            new Uri($"/v1/cpv?q={Uri.EscapeDataString(query)}", UriKind.Relative));

        Assert.Equal(code, Assert.Single(codes!).Code);
    }

    [Fact]
    public async Task CpvLookupListsBroadCategoriesFirstAndNeedsTwoCharacters()
    {
        var products = await _client.GetFromJsonAsync<IxnosData.Application.Items.CodeLabel[]>(new Uri("/v1/cpv?q=φαρμακευτικ", UriKind.Relative));
        var tooShort = await _client.GetFromJsonAsync<IxnosData.Application.Items.CodeLabel[]>(new Uri("/v1/cpv?q=φ", UriKind.Relative));

        Assert.Equal(["33000000-0", "33600000-6"], products!.Select(c => c.Code)); // broad category first
        Assert.Empty(tooShort!);
    }

    [Fact]
    public async Task AuthorityNamesFindThatAuthoritysRecords()
    {
        // No title mentions the authority; the match is on the organisation's name.
        var result = await SearchAsync("q=Δήμος Δοκιμών");

        Assert.Equal(4, result.Items.Count(i => i.Organisation?.Id == Org));
    }

    [Fact]
    public async Task GreeklishAuthorityNamesFindThatAuthoritysRecords()
    {
        var result = await SearchAsync("q=dimos dokimon");

        Assert.Equal("greeklish", result.Mode);
        Assert.Equal(4, result.Items.Count(i => i.Organisation?.Id == Org));
    }

    [Fact]
    public async Task StatusSaysWhenEachSourceWasLastRefreshed()
    {
        var finished = DateTimeOffset.UtcNow.AddMinutes(-5);
        await using (var db = postgres.CreateDbContext())
        {
            db.IngestionRuns.Add(new Domain.Operations.IngestionRun
            {
                Source = "diavgeia",
                Mode = "status-endpoint-test",
                Status = Domain.Operations.IngestionRunStatus.Succeeded,
                StartedAt = finished.AddMinutes(-1),
                FinishedAt = finished,
            });
            await db.SaveChangesAsync();
        }

        var status = await _client.GetFromJsonAsync<IxnosData.Application.Operations.DataStatus>(new Uri("/v1/status", UriKind.Relative));

        var diavgeia = Assert.Single(status!.Sources, s => s.Source == "diavgeia");
        Assert.True(diavgeia.UpdatedAt >= finished.AddSeconds(-1));
        Assert.True(status.UpdatedAt >= diavgeia.UpdatedAt);
    }

    [Fact]
    public async Task MetricsCountRecordsPerSourceAndRecentRuns()
    {
        var metrics = await _client.GetFromJsonAsync<IxnosData.Application.Operations.PublicMetrics>(new Uri("/v1/metrics", UriKind.Relative));

        Assert.NotNull(metrics);
        Assert.True(Assert.Single(metrics.Sources, s => s.Source == "khmdhs").Records >= 17); // this class's records at least
        Assert.True(metrics.RecentRuns.Count <= 10);
        Assert.True(metrics.Users >= 0 && metrics.ApiKeys >= 0);
    }

    [Fact]
    public async Task SitemapListsRecordsAndOrganisations()
    {
        var index = await _client.GetFromJsonAsync<IxnosData.Application.Sitemap.SitemapIndex>(new Uri("/v1/sitemap", UriKind.Relative));
        var items = await _client.GetFromJsonAsync<List<IxnosData.Application.Sitemap.SitemapEntry>>(new Uri("/v1/sitemap/items/0", UriKind.Relative));
        var organisations = await _client.GetFromJsonAsync<List<IxnosData.Application.Sitemap.SitemapEntry>>(new Uri("/v1/sitemap/organisations", UriKind.Relative));

        Assert.True(index!.ItemPages >= 1);
        Assert.Contains(items!, e => e.Id == "26PROC000000101");
        Assert.Contains(organisations!, e => e.Id == Org);
    }

    [Fact]
    public async Task SortsByAmount()
    {
        var byAmount = await SearchAsync("sort=amount");

        Assert.Equal(
            byAmount.Items.Select(i => i.AmountEur).OrderByDescending(a => a),
            byAmount.Items.Select(i => i.AmountEur));
    }

    [Fact]
    public async Task IdentifierAndVatQueriesAreExact()
    {
        var byAdam = await SearchAsync("q=26proc000000101");
        var byVat = await SearchAsync("q=090114939");

        Assert.Equal("identifier", byAdam.Mode);
        // The notice itself first, then the award that references it.
        Assert.Equal(["26PROC000000101", "26AWRD000000102"], byAdam.Items.Select(i => i.SourceId));
        Assert.Equal("tax_id", byVat.Mode);
        Assert.Equal(4, byVat.Total); // not the replaced decision
    }

    [Fact]
    public async Task InvalidParametersReturnValidationProblem()
    {
        using var response = await _client.GetAsync(new Uri("/v1/search?kind=tender", UriKind.Relative));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("kind", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task ItemDetailHasLabelsContractorsAndLinks()
    {
        var item = await _client.GetFromJsonAsync<ItemDetail>(new Uri("/v1/items/26AWRD000000102", UriKind.Relative));

        Assert.NotNull(item);
        Assert.Equal("Φαρμακευτικά προϊόντα", Assert.Single(item.Cpv).LabelEl);
        Assert.Equal("Ιωάννινα", item.Nuts?.LabelEl);
        var winner = Assert.Single(item.Contractors);
        Assert.Equal(("ΦΑΡΜΑΚΑΠΟΘΗΚΗ Α.Ε.", "winner"), (winner.Name, winner.Role));
        var resolved = Assert.Single(item.Links, l => l.Relation == "notice");
        Assert.Equal("notice", resolved.Kind); // target is in ixnos-data, so its kind and title are known
        Assert.Null(Assert.Single(item.Links, l => l.Relation == "contract").Kind);
        Assert.EndsWith("/auction/attachment/26AWRD000000102", item.DocumentUrl?.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task ResponsesKeepGreekReadable()
    {
        var json = await _client.GetStringAsync(new Uri("/v1/items/26PROC000000101", UriKind.Relative));

        Assert.Contains("ΦΑΡΜΑΚΩΝ", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task OrganisationHasCountsAndRecentRecords()
    {
        var organisation = await _client.GetFromJsonAsync<OrganisationDetail>(new Uri($"/v1/organisations/{Org}", UriKind.Relative));

        Assert.NotNull(organisation);
        Assert.Equal(2, organisation.ItemCounts["notice"]);
        Assert.Equal(11_500m, organisation.AwardedLast12MonthsEur);
        var year = Assert.Single(organisation.AwardedByYear);
        Assert.Equal((11_500m, 14_260m), (year.AmountEur, year.PaidEur));
        Assert.Equal(14_260m, organisation.PaidLast12MonthsEur);
        // One contractor: awarded in ΚΗΜΔΗΣ, paid in Διαύγεια; the replaced payment is left out.
        var contractor = Assert.Single(organisation.TopContractors);
        Assert.Equal(("ΦΑΡΜΑΚΑΠΟΘΗΚΗ Α.Ε.", 11_500m, 14_260m), (contractor.Name, contractor.AmountEur, contractor.PaidEur));
        Assert.DoesNotContain(organisation.RecentItems, i => i.SourceId == "ΨΠΑΛ46ΜΤΛ6-ΠΑΛ");
        Assert.Null(organisation.DominantSupplier); // one award is too few to say anything
    }

    [Fact]
    public async Task OrganisationNamesASupplierWithMostOfItsAwards()
    {
        var organisation = await _client.GetFromJsonAsync<OrganisationDetail>(new Uri($"/v1/organisations/{SignalsOrg}", UriKind.Relative));

        Assert.Equal(new DominantSupplier("ΚΑΘΑΡΙΣΜΟΙ Ο.Ε.", 0.6m, 6, 10), organisation?.DominantSupplier);
    }

    [Fact]
    public async Task SignalsAreShownAndFilterable()
    {
        var single = await SearchAsync("signal=single_offer", SignalsOrg);
        var nearLimit = await SearchAsync("signal=near_direct_award_limit", SignalsOrg);
        var item = await _client.GetFromJsonAsync<ItemDetail>(new Uri("/v1/items/26SYMV000000105", UriKind.Relative));

        Assert.Equal(["26SYMV000000104"], single.Items.Select(i => i.SourceId));
        Assert.Equal([Signals.SingleOffer], single.Items[0].Signals);
        Assert.Equal(["26SYMV000000105"], nearLimit.Items.Select(i => i.SourceId));
        Assert.Equal([Signals.NearDirectAwardLimit], item?.Signals);
        using var unknown = await _client.GetAsync(new Uri("/v1/search?signal=suspicious", UriKind.Relative));
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
    }

    [Theory]
    [InlineData("/v1/items/26PROC999999999")]
    [InlineData("/v1/organisations/no-such-body")]
    public async Task UnknownIdsReturnNotFound(string path)
    {
        using var response = await _client.GetAsync(new Uri(path, UriKind.Relative));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
