using Microsoft.AspNetCore.Diagnostics;

namespace InventoryApi.Errors;

/// <summary>Turns every exception into the documented error format.</summary>
public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, body) = exception switch
        {
            InvalidInputException invalid =>
                (StatusCodes.Status400BadRequest, ApiErrors.Of("validation_failed", invalid.Message, invalid.Fields)),
            BadHttpRequestException =>
                (StatusCodes.Status400BadRequest, ApiErrors.UnreadableBody),
            NotFoundException notFound =>
                (StatusCodes.Status404NotFound, ApiErrors.Of("not_found", notFound.Message)),
            ConflictException conflict =>
                (StatusCodes.Status409Conflict, ApiErrors.Of("conflict", conflict.Message)),
            _ => (StatusCodes.Status500InternalServerError, ApiErrors.Internal),
        };
        if (status == StatusCodes.Status500InternalServerError)
        {
            // The details stay in the server log; the client gets a generic message.
            logger.LogError(exception, "Unhandled exception for {Method} {Path}",
                httpContext.Request.Method, httpContext.Request.Path);
        }
        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(body, cancellationToken);
        return true;
    }
}
