using System.Text.Json;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace IxnosData.Infrastructure.Persistence.Configurations;

// ItemKind.SpendingApproval is stored as "spending_approval", so the pipeline writes plain strings.
internal sealed class SnakeCaseEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    value => ToText(value),
    text => FromText[text])
    where TEnum : struct, Enum
{
    private static readonly Dictionary<string, TEnum> FromText =
        Enum.GetValues<TEnum>().ToDictionary(ToText, value => value, StringComparer.Ordinal);

    private static string ToText(TEnum value) => JsonNamingPolicy.SnakeCaseLower.ConvertName(value.ToString());
}
