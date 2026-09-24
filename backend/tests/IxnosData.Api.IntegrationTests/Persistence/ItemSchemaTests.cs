using IxnosData.Api.IntegrationTests.Fixtures;
using IxnosData.Domain.Contractors;
using IxnosData.Domain.Items;
using Microsoft.EntityFrameworkCore;

namespace IxnosData.Api.IntegrationTests.Persistence;

[Collection(PostgresTests.Name)]
public class ItemSchemaTests(PostgresFixture postgres)
{
    private static ProcurementItem Item(string sourceId, ItemKind kind, string title, string? description) => new()
    {
        Source = "khmdhs",
        SourceId = sourceId,
        Kind = kind,
        Title = title,
        Description = description,
        TextNormalised = title.ToUpperInvariant(),
        SearchKey = "x",
        CpvCodes = ["33600000-6"],
        PublishedAt = DateTimeOffset.UtcNow,
        Raw = "{}",
    };

    [Fact]
    public async Task SearchColumnIsGeneratedFromTitleAndDescription()
    {
        await using (var db = postgres.CreateDbContext())
        {
            // ΚΗΜΔΗΣ cuts titles at 100 characters; the detail is in the description.
            db.ProcurementItems.Add(Item("26PROC000000001", ItemKind.Notice, "ΠΡΟΜΗΘΕΙΑ ΥΛΙΚΩΝ", "Φάρμακα για το Κέντρο Υγείας"));
            await db.SaveChangesAsync();
        }

        await using var check = postgres.CreateDbContext();
        var found = await check.Database
            .SqlQuery<string>($"""
                SELECT source_id AS "Value" FROM procurement_item
                WHERE search @@ websearch_to_tsquery('ixnos_data_greek', 'φαρμακων')
                """)
            .ToListAsync();

        Assert.Contains("26PROC000000001", found);
    }

    [Fact]
    public async Task KindsAndRolesAreStoredAsSnakeCaseText()
    {
        await using (var db = postgres.CreateDbContext())
        {
            var item = Item("ΑΑΑΑ46ΑΑΑΑ-ΑΑΑ", ItemKind.SpendingApproval, "ΕΓΚΡΙΣΗ ΔΑΠΑΝΗΣ", null);
            item.Source = "diavgeia";
            var contractor = new Contractor { Name = "ΑΝΑΔΟΧΟΣ", TaxId = "090114939" };
            db.AddRange(item, contractor);
            await db.SaveChangesAsync();
            db.ItemContractors.Add(new ItemContractor { ItemId = item.Id, ContractorId = contractor.Id, Role = ContractorRole.Payee });
            await db.SaveChangesAsync();
        }

        await using var check = postgres.CreateDbContext();
        var kind = await check.Database
            .SqlQuery<string>($"""SELECT kind AS "Value" FROM procurement_item WHERE source = 'diavgeia'""")
            .SingleAsync();
        var role = await check.Database
            .SqlQuery<string>($"""SELECT role AS "Value" FROM item_contractor""")
            .SingleAsync();
        var roundTrip = await check.ProcurementItems.SingleAsync(item => item.Source == "diavgeia");

        Assert.Equal("spending_approval", kind);
        Assert.Equal("payee", role);
        Assert.Equal(ItemKind.SpendingApproval, roundTrip.Kind);
    }

    [Fact]
    public async Task LinksKeepUnresolvedTargets()
    {
        await using var db = postgres.CreateDbContext();
        var award = Item("26AWRD000000001", ItemKind.Award, "ΑΝΑΘΕΣΗ", null);
        db.ProcurementItems.Add(award);
        await db.SaveChangesAsync();

        // The notice this award names has not been ingested: the link is kept, unresolved.
        db.ItemLinks.Add(new ItemLink
        {
            FromItemId = award.Id,
            Relation = "notice",
            ToSource = "khmdhs",
            ToSourceId = "26PROC099999999",
        });
        await db.SaveChangesAsync();

        var link = await db.ItemLinks.SingleAsync(l => l.FromItemId == award.Id);
        Assert.Null(link.ToItemId);
    }
}
