using System.Reflection;
using System.Text.Json;

namespace IxnosData.Client.Tests;

/// <summary>
/// The models against contracts/openapi/v1.json: a property the API adds or renames fails here,
/// so the client is updated with the API.
/// </summary>
public class ContractTests
{
    private static readonly JsonElement Schemas = JsonDocument
        .Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "openapi-v1.json")))
        .RootElement.GetProperty("components").GetProperty("schemas");

    [Theory]
    [InlineData(typeof(ItemSummary), "ItemSummary")]
    [InlineData(typeof(SearchResult), "SearchItemsResult")]
    [InlineData(typeof(ItemDetail), "ItemDetail")]
    [InlineData(typeof(ItemContractor), "ItemContractorView")]
    [InlineData(typeof(ItemLink), "ItemLinkView")]
    [InlineData(typeof(CodeLabel), "CodeLabel")]
    [InlineData(typeof(OrganisationRef), "OrganisationRef")]
    [InlineData(typeof(OrganisationDetail), "OrganisationDetail")]
    [InlineData(typeof(YearSpend), "YearSpend")]
    [InlineData(typeof(ContractorSpend), "ContractorSpend")]
    [InlineData(typeof(DominantSupplier), "DominantSupplier")]
    [InlineData(typeof(DataStatus), "DataStatus")]
    [InlineData(typeof(SourceStatus), "SourceStatus")]
    public void ModelHasExactlyTheSchemasProperties(Type model, string schema)
    {
        var expected = Schemas.GetProperty(schema).GetProperty("properties").EnumerateObject()
            .Select(p => p.Name).Order(StringComparer.Ordinal);
        var actual = model.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name)).Order(StringComparer.Ordinal);

        Assert.Equal(expected, actual);
    }
}
