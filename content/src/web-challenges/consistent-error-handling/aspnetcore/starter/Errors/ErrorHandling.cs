namespace InventoryApi.Errors;

/// <summary>
/// Central error handling, wired up by Program.cs.
///
/// TODO: every error response must use the documented format
/// { "error": { "code": "...", "message": "..." } } (plus "fields" for
/// validation_failed). Map NotFoundException, ConflictException and
/// InvalidInputException, answer a request body that cannot be read with
/// validation_failed (see ApiBehaviorOptions.InvalidModelStateResponseFactory),
/// and answer anything else with 500 "internal" and a generic message, logging
/// the details on the server only. ApiExceptionHandler.cs is a good place for
/// the exception mapping.
/// </summary>
public static class ErrorHandling
{
    public static IServiceCollection AddApiErrorHandling(this IServiceCollection services)
    {
        return services;
    }

    public static WebApplication UseApiErrorHandling(this WebApplication app)
    {
        // Temporary: added while debugging. It answers 500 for every error and
        // shows the exception's message, type and stack trace to any client.
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (Exception ex)
            {
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                await context.Response.WriteAsJsonAsync(new
                {
                    error = ex.Message,
                    exception = ex.GetType().FullName,
                    stackTrace = ex.StackTrace,
                });
            }
        });
        return app;
    }
}
