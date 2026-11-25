using Microsoft.AspNetCore.Diagnostics;

namespace InventoryApi.Errors;

/// <summary>
/// TODO: turn exceptions into the documented error format. Register it in
/// ErrorHandling.cs (AddExceptionHandler, then UseExceptionHandler), or use
/// another single, central mechanism if you prefer.
/// </summary>
public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // Return true once the response has been written.
        return ValueTask.FromResult(false);
    }
}
