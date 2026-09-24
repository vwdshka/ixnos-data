using System.Text.Json;
using IxnosData.Application.Search;

namespace IxnosData.Application.Tests.Search;

/// <summary>
/// Runs the shared cases in contracts/text-normalisation/cases.json, which the Python
/// pipeline also runs, so both sides normalise identically.
/// </summary>
public class GreekTextTests
{
    private static readonly JsonElement Cases = JsonDocument.Parse(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "text-normalisation-cases.json"))).RootElement;

    public static TheoryData<string, string> NormaliseCases()
    {
        var data = new TheoryData<string, string>();
        foreach (var item in Cases.GetProperty("normalise").EnumerateArray())
        {
            data.Add(item.GetProperty("input").GetString()!, item.GetProperty("expected").GetString()!);
        }

        return data;
    }

    public static TheoryData<string, string[]> SearchKeyCases()
    {
        var data = new TheoryData<string, string[]>();
        foreach (var item in Cases.GetProperty("search_keys").EnumerateArray())
        {
            var expected = item.GetProperty("expected").EnumerateArray().Select(k => k.GetString()!).ToArray();
            data.Add(item.GetProperty("input").GetString()!, expected);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(NormaliseCases))]
    public void NormaliseMatchesSharedCases(string input, string expected) =>
        Assert.Equal(expected, GreekText.Normalise(input));

    [Theory]
    [MemberData(nameof(SearchKeyCases))]
    public void SearchKeysMatchSharedCases(string input, string[] expected) =>
        Assert.Equal(expected, GreekText.SearchKeys(input));

    [Fact]
    public void GreeklishQueryKeysIncludeTheGreekTextKey() =>
        Assert.Contains(GreekText.SearchKey("Υπηρεσίες καθαρισμού"), GreekText.SearchKeys("ypiresies katharismou"));
}
