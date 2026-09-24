namespace IxnosData.Domain.Reference;

// Greek NUTS 2024 regions: "EL" > "EL5" (Βόρεια Ελλάδα) > "EL54" (Ήπειρος) > "EL543" (Ιωάννινα).
public class NutsRegion
{
    public required string Code { get; set; }

    public string? ParentCode { get; set; }

    public short Level { get; set; } // 0 = country

    public required string LabelEl { get; set; }

    public required string LabelEn { get; set; } // Eurostat's transliteration for now ("Ipeiros")
}
