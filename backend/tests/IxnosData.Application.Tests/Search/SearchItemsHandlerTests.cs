using IxnosData.Application.Search;

namespace IxnosData.Application.Tests.Search;

public class SearchItemsHandlerTests
{
    private static SearchItemsRequest Request(
        string? q = null, string[]? kind = null, string? cpv = null, string? nuts = null,
        decimal? minAmount = null, decimal? maxAmount = null, int? page = null, int? pageSize = null,
        string? sort = null) =>
        new(q, kind, cpv, nuts, null, minAmount, maxAmount, null, null, page, pageSize, sort);

    private static (SearchCriteria Criteria, Dictionary<string, string[]> Errors) Interpret(SearchItemsRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        return (SearchItemsHandler.Interpret(request, errors), errors);
    }

    [Theory]
    [InlineData("26PROC019787840", "26PROC019787840")]
    [InlineData("26proc019787840", "26PROC019787840")]
    [InlineData("ΛΓ2ΣΩΗΥ-Ν4Ψ", "ΛΓ2ΣΩΗΥ-Ν4Ψ")]
    [InlineData("λγ2σωηυ-ν4ψ", "ΛΓ2ΣΩΗΥ-Ν4Ψ")]
    [InlineData("Ψ2TH46904E-PPΓ", "Ψ2ΤΗ46904Ε-ΡΡΓ")] // Latin look-alikes
    public void IdentifiersAreLookedUpExactly(string query, string expected)
    {
        var (criteria, errors) = Interpret(Request(q: query));

        Assert.Empty(errors);
        Assert.Equal(QueryMode.Identifier, criteria.Mode);
        Assert.Equal(expected, criteria.Identifier);
    }

    [Fact]
    public void NineDigitsAreAVatNumber()
    {
        var (criteria, _) = Interpret(Request(q: "090114939"));

        Assert.Equal(QueryMode.TaxId, criteria.Mode);
        Assert.Equal("090114939", criteria.TaxId);
    }

    [Fact]
    public void LatinScriptIsGreeklishWithPhoneticKeys()
    {
        var (criteria, _) = Interpret(Request(q: "promitheia farmakon"));

        Assert.Equal(QueryMode.Greeklish, criteria.Mode);
        Assert.Contains("promithia farmakon", criteria.GreeklishKeys);
    }

    [Fact]
    public void GreekTextIsNormalisedForTypoMatching()
    {
        var (criteria, _) = Interpret(Request(q: "  Προμήθεια ΦΑΡΜΆΚΩΝ "));

        Assert.Equal(QueryMode.Text, criteria.Mode);
        Assert.Equal("Προμήθεια ΦΑΡΜΆΚΩΝ", criteria.Text);
        Assert.Equal("προμηθεια φαρμακων", criteria.NormalisedText);
        Assert.Empty(criteria.GreeklishKeys);
    }

    [Theory]
    [InlineData("3314", "3314")]
    [InlineData("33141000-0", "33141")]
    [InlineData("33000000", "33")]
    [InlineData("03000000-1", "03")]
    public void CpvCodesBecomePrefixes(string cpv, string prefix)
    {
        var (criteria, errors) = Interpret(Request(cpv: cpv));

        Assert.Empty(errors);
        Assert.Equal(prefix, criteria.CpvPrefix);
    }

    [Fact]
    public void KindsMayBeCommaSeparatedOrRepeated()
    {
        var (criteria, errors) = Interpret(Request(kind: ["notice,award", "notice"]));

        Assert.Empty(errors);
        Assert.Equal(["notice", "award"], criteria.Kinds);
    }

    [Fact]
    public void InvalidParametersAreAllReported()
    {
        var (_, errors) = Interpret(Request(
            kind: ["tender"], cpv: "3", nuts: "Epirus", minAmount: 10, maxAmount: 5, page: 0, pageSize: 500));

        Assert.Equal(["cpv", "kind", "minAmount", "nuts", "page", "pageSize"], errors.Keys.Order());
    }

    [Fact]
    public void DeepPagingIsCapped()
    {
        var (_, errors) = Interpret(Request(page: 501, pageSize: 20));

        Assert.Contains("page", errors.Keys);
    }

    [Theory]
    [InlineData(null, SearchSort.Relevance)]
    [InlineData("deadline", SearchSort.Deadline)]
    [InlineData("Amount", SearchSort.Amount)]
    public void ReadsSort(string? sort, SearchSort expected)
    {
        var (criteria, errors) = Interpret(Request(sort: sort));

        Assert.Empty(errors);
        Assert.Equal(expected, criteria.Sort);
    }

    [Fact]
    public void RejectsUnknownSort()
    {
        var (_, errors) = Interpret(Request(sort: "cheapest"));

        Assert.Contains("sort", errors.Keys);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData(999_999_999L, false)]
    [InlineData(202_420_304_008L, true)]
    public void FlagsImplausibleAmounts(long? amount, bool expected) =>
        Assert.Equal(expected, Amounts.IsImplausible((decimal?)amount));
}
