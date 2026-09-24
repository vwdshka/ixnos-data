using System.Net;

namespace IxnosData.Client;

/// <summary>
/// The API refused a request: 400 (invalid parameters; <see cref="Body"/> names them), 429 (rate
/// limit; retry after the Retry-After delay) or 503 (search too slow; add a filter).
/// </summary>
public sealed class IxnosDataException : Exception
{
    /// <summary>Creates the exception for a refused request.</summary>
    public IxnosDataException(HttpStatusCode statusCode, string body)
        : base($"The ixnos-data API answered {(int)statusCode} {statusCode}.")
    {
        StatusCode = statusCode;
        Body = body;
    }

    /// <summary>The HTTP status.</summary>
    public HttpStatusCode StatusCode { get; }

    /// <summary>The response body: problem details as JSON.</summary>
    public string Body { get; }
}
