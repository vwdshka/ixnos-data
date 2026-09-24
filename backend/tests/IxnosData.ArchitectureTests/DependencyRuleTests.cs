using System.Reflection;

namespace IxnosData.ArchitectureTests;

/// <summary>
/// Enforces the Clean Architecture dependency rule: Domain depends on nothing,
/// Application only on Domain, Infrastructure on Application and Domain.
/// </summary>
public class DependencyRuleTests
{
    private static readonly Dictionary<string, string[]> AllowedReferences = new()
    {
        ["IxnosData.Domain"] = [],
        ["IxnosData.Application"] = ["IxnosData.Domain"],
        ["IxnosData.Infrastructure"] = ["IxnosData.Domain", "IxnosData.Application"],
    };

    [Theory]
    [InlineData("IxnosData.Domain")]
    [InlineData("IxnosData.Application")]
    [InlineData("IxnosData.Infrastructure")]
    public void LayerReferencesOnlyAllowedLayers(string layer)
    {
        var ixnosDataReferences = Assembly.Load(layer)
            .GetReferencedAssemblies()
            .Select(reference => reference.Name!)
            .Where(name => name.StartsWith("IxnosData.", StringComparison.Ordinal));

        Assert.All(ixnosDataReferences, name => Assert.Contains(name, AllowedReferences[layer]));
    }
}
