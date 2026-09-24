using Microsoft.AspNetCore.Diagnostics;
using Npgsql;

namespace IxnosData.Api.Errors;

// A query PostgreSQL cancelled for running too long means the request asked too much, not that
// the API broke: answer 503 with advice instead of a 500.
public sealed class QueryTimeoutHandler(IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not PostgresException { SqlState: PostgresErrorCodes.QueryCanceled })
        {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails =
            {
                Status = StatusCodes.Status503ServiceUnavailable,
                Title = "The query took too long.",
                Detail = "Narrow it down: add a filter (trade, region, type) or more specific words.",
            },
        });
    }
}
