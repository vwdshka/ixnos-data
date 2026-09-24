using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace IxnosData.Api.IntegrationTests;

public class HealthEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task LivenessDoesNotNeedTheDatabase()
    {
        // Nothing listens on port 1, so this proves /health never touches the database.
        using var client = factory
            .WithWebHostBuilder(host => host.UseSetting(
                "ConnectionStrings:IxnosData", "Host=localhost;Port=1;Database=none"))
            .CreateClient();

        using var response = await client.GetAsync(new Uri("/health", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
