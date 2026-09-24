using System.Net;
using System.Text.Json;
using IxnosData.Api.Errors;
using IxnosData.Api.IntegrationTests.Fixtures;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace IxnosData.Api.IntegrationTests;

[Collection(PostgresTests.Name)]
public sealed class QueryTimeoutTests(PostgresFixture postgres)
{
    [Fact]
    public async Task QueriesPostgresCancelsBecomeA503WithAdvice()
    {
        await using var api = postgres.CreateApi();
        var context = new DefaultHttpContext { RequestServices = api.Services };
        context.Response.Body = new MemoryStream();
        var handler = new QueryTimeoutHandler(api.Services.GetRequiredService<IProblemDetailsService>());
        // What PostgreSQL raises when statement_timeout cancels a query.
        var cancelled = new PostgresException("canceling statement due to statement timeout", "ERROR", "ERROR", PostgresErrorCodes.QueryCanceled);

        var handled = await handler.TryHandleAsync(context, cancelled, CancellationToken.None);
        var ignored = await handler.TryHandleAsync(new DefaultHttpContext(), new InvalidOperationException(), CancellationToken.None);

        Assert.True(handled);
        Assert.False(ignored);
        Assert.Equal((int)HttpStatusCode.ServiceUnavailable, context.Response.StatusCode);
        context.Response.Body.Position = 0;
        var problem = await JsonDocument.ParseAsync(context.Response.Body);
        Assert.Contains("filter", problem.RootElement.GetProperty("detail").GetString(), StringComparison.Ordinal);
    }
}
