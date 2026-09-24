using System.Text.RegularExpressions;

namespace IxnosData.Application.Search;

// Same rules as normalise_ada in the pipeline, so lowercase and Latin look-alike letters work. An
// ΑΔΑ is 5-10 Greek capitals or digits, a hyphen and 3 more: "ΛΓ2ΣΩΗΥ-Ν4Ψ".
public static partial class Ada
{
    private const string LatinLookalikes = "ABEHIKMNOPTXYZ";
    private const string GreekCapitals = "ΑΒΕΗΙΚΜΝΟΡΤΧΥΖ";

    public static string? Normalise(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var chars = Whitespace().Replace(text, string.Empty).ToUpperInvariant().ToCharArray();
        for (var i = 0; i < chars.Length; i++)
        {
            var index = LatinLookalikes.IndexOf(chars[i], StringComparison.Ordinal);
            if (index >= 0)
            {
                chars[i] = GreekCapitals[index];
            }
        }

        var candidate = new string(chars);
        return Pattern().IsMatch(candidate) ? candidate : null;
    }

    // At least one Greek letter: all-digit placeholders such as "00000-000" are not ΑΔΑ.
    [GeneratedRegex(@"^(?=.*[Α-Ω])[0-9Α-Ω]{5,10}-[0-9Α-Ω]{3}$")]
    private static partial Regex Pattern();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
