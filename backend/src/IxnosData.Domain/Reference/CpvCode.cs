namespace IxnosData.Domain.Reference;

// EU CPV 2008 vocabulary: what is being bought. Seven levels, from division ("33000000-0") down.
public class CpvCode
{
    public required string Code { get; set; } // with check digit, "33141000-0"

    public string? ParentCode { get; set; }

    public short Level { get; set; }

    public required string LabelEl { get; set; }

    public required string LabelEn { get; set; }
}
