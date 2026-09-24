using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace IxnosData.Application.Search;

// Keep in step with ixnos_data_pipeline.common.greek_text: both run
// contracts/text-normalisation/cases.json.
public static partial class GreekText
{
    // 2^3 = 8 keys at most.
    public const int MaxExpanded = 3;

    // Lowercased Latin letters that look like Greek ones, mostly from uppercase data entry.
    private const string HomoglyphsLatin = "abehikmnoptxyzvu";
    private const string HomoglyphsGreek = "αβεηικμνορτχυζνυ";

    private static readonly Dictionary<string, string> GreekKeys = new(StringComparer.Ordinal)
    {
        ["ου"] = "u",
        ["ει"] = "i",
        ["οι"] = "i",
        ["υι"] = "i",
        ["αι"] = "e",
        ["αυ"] = "ab",
        ["ευ"] = "eb",
        ["μπ"] = "b",
        ["ντ"] = "d",
        ["γκ"] = "g",
        ["γγ"] = "g",
        ["α"] = "a",
        ["β"] = "b",
        ["γ"] = "g",
        ["δ"] = "d",
        ["ε"] = "e",
        ["ζ"] = "z",
        ["η"] = "i",
        ["θ"] = "th",
        ["ι"] = "i",
        ["κ"] = "k",
        ["λ"] = "l",
        ["μ"] = "m",
        ["ν"] = "n",
        ["ξ"] = "ks",
        ["ο"] = "o",
        ["π"] = "p",
        ["ρ"] = "r",
        ["σ"] = "s",
        ["τ"] = "t",
        ["υ"] = "i",
        ["φ"] = "f",
        ["χ"] = "h",
        ["ψ"] = "ps",
        ["ω"] = "o",
    };

    private static readonly Dictionary<string, string> LatinKeys = new(StringComparer.Ordinal)
    {
        ["ou"] = "u",
        ["ei"] = "i",
        ["oi"] = "i",
        ["yi"] = "i",
        ["ui"] = "i",
        ["ai"] = "e",
        ["au"] = "ab",
        ["av"] = "ab",
        ["eu"] = "eb",
        ["ev"] = "eb",
        ["mp"] = "b",
        ["nt"] = "d",
        ["gk"] = "g",
        ["gg"] = "g",
        ["th"] = "th",
        ["ch"] = "h",
        ["kh"] = "h",
        ["a"] = "a",
        ["b"] = "b",
        ["c"] = "k",
        ["d"] = "d",
        ["e"] = "e",
        ["f"] = "f",
        ["g"] = "g",
        ["i"] = "i",
        ["j"] = "tz",
        ["k"] = "k",
        ["l"] = "l",
        ["m"] = "m",
        ["n"] = "n",
        ["o"] = "o",
        ["p"] = "p",
        ["q"] = "k",
        ["r"] = "r",
        ["s"] = "s",
        ["t"] = "t",
        ["u"] = "i",
        ["v"] = "b",
        ["w"] = "o",
        ["y"] = "i",
        ["z"] = "z",
    };

    // Greeklish letters with more than one reading, most likely first.
    private static readonly Dictionary<char, string[]> Ambiguous = new()
    {
        ['h'] = ["i", "h"],
        ['x'] = ["h", "ks"],
    };

    // Greeklish digits, read as letters only next to a vowel ("8elo", "a3ia", not "3d").
    private static readonly Dictionary<char, string> DigitLetters = new() { ['8'] = "th", ['3'] = "ks" };

    private const string LatinVowels = "aeiouyw";

    // Lowercase, no accents, final sigma folded, Latin look-alikes fixed, whitespace collapsed.
    public static string Normalise(string text)
    {
        // Lowercase (not uppercase) to match the Python side and PostgreSQL lower().
#pragma warning disable CA1308
        var decomposed = text.ToLowerInvariant().Normalize(NormalizationForm.FormD);
#pragma warning restore CA1308
        var stripped = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                stripped.Append(c);
            }
        }

        var folded = stripped.ToString()
            .Normalize(NormalizationForm.FormC)
            .Replace('ς', 'σ')
            .Replace('\u00b5', '\u03bc'); // micro sign -> Greek mu (they look identical)
        var fixedText = LetterRun().Replace(folded, FixHomoglyphs);
        return Whitespace().Replace(fixedText, " ").Trim();
    }

    // Each ambiguous Greeklish letter (h, x) doubles the keys, up to MaxExpanded of them.
    public static IReadOnlyList<string> SearchKeys(string text)
    {
        var segments = KeySegments(Normalise(text));

        var expandedLeft = MaxExpanded;
        var partials = new List<string> { string.Empty };
        foreach (var options in segments)
        {
            var choices = options;
            if (options.Length > 1)
            {
                choices = expandedLeft > 0 ? options : [options[0]];
                expandedLeft--;
            }

            partials = [.. partials.SelectMany(prefix => choices.Select(choice => prefix + choice))];
        }

        return [.. partials
            .Select(key => DoubledLetter().Replace(Whitespace().Replace(key, " ").Trim(), "$1"))
            .Distinct(StringComparer.Ordinal)];
    }

    // The key stored text is indexed under.
    public static string SearchKey(string text) => SearchKeys(text)[0];

    private static string FixHomoglyphs(Match match)
    {
        var word = match.Value;
        if (!GreekLetter().IsMatch(word) || !LatinLetter().IsMatch(word))
        {
            return word;
        }

        var chars = word.ToCharArray();
        for (var i = 0; i < chars.Length; i++)
        {
            var index = HomoglyphsLatin.IndexOf(chars[i], StringComparison.Ordinal);
            if (index >= 0)
            {
                chars[i] = HomoglyphsGreek[index];
            }
        }

        return new string(chars);
    }

    private static List<string[]> KeySegments(string text)
    {
        var segments = new List<string[]>(text.Length);
        var i = 0;
        while (i < text.Length)
        {
            if (i + 1 < text.Length)
            {
                var pair = text.Substring(i, 2);
                if (GreekKeys.TryGetValue(pair, out var pairKey) || LatinKeys.TryGetValue(pair, out pairKey))
                {
                    segments.Add([pairKey]);
                    i += 2;
                    continue;
                }
            }

            var c = text[i];
            var single = c.ToString();
            if (Ambiguous.TryGetValue(c, out var readings))
            {
                segments.Add(readings);
            }
            else if (GreekKeys.TryGetValue(single, out var key) || LatinKeys.TryGetValue(single, out key))
            {
                segments.Add([key]);
            }
            else if (DigitLetters.TryGetValue(c, out var digitKey) && NextToVowel(text, i))
            {
                segments.Add([digitKey]);
            }
            else
            {
                segments.Add([char.IsLetterOrDigit(c) ? single : " "]);
            }

            i++;
        }

        return segments;
    }

    private static bool NextToVowel(string text, int i) =>
        (i > 0 && LatinVowels.Contains(text[i - 1], StringComparison.Ordinal))
        || (i + 1 < text.Length && LatinVowels.Contains(text[i + 1], StringComparison.Ordinal));

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"\p{L}+")]
    private static partial Regex LetterRun();

    [GeneratedRegex(@"[Ͱ-Ͽ]")]
    private static partial Regex GreekLetter();

    [GeneratedRegex("[a-z]")]
    private static partial Regex LatinLetter();

    [GeneratedRegex("([a-z])\\1+")]
    private static partial Regex DoubledLetter();
}
