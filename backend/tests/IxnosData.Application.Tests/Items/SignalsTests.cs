using IxnosData.Application.Items;

namespace IxnosData.Application.Tests.Items;

public class SignalsTests
{
    [Theory]
    [InlineData("contract", "1", null, 1, 100_000, Signals.SingleOffer)] // open procedure, one offer
    [InlineData("contract", "6", null, 1, 5_000, null)] // a direct award has one offer by design
    [InlineData("contract", "1", null, 2, 100_000, null)]
    [InlineData("award", "6", null, null, 29_900, Signals.NearDirectAwardLimit)]
    [InlineData("award", "6", null, null, 28_500, Signals.NearDirectAwardLimit)] // exactly 95%
    [InlineData("award", "6", null, null, 28_499, null)]
    [InlineData("award", "6", null, null, 30_001, null)] // above the limit is not "just under" it
    [InlineData("award", "6", "10", null, 29_900, null)] // works: the limit is 60,000
    [InlineData("contract", "6", "10", null, 59_000, Signals.NearDirectAwardLimit)]
    [InlineData("notice", "6", null, null, 29_900, null)] // only awards and contracts
    [InlineData("award", "1", null, null, 29_900, null)]
    public void FlagsOnlyWhatTheDefinitionsSay(string kind, string procedure, string? contractType, int? offers, double amount, string? expected)
    {
        var signals = Signals.Of(kind, procedure, contractType, offers, (decimal)amount);

        Assert.Equal(expected is null ? [] : [expected], signals);
    }
}
