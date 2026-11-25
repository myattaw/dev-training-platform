using Microsoft.AspNetCore.Mvc;

namespace InventoryApi.Errors;

/// <summary>Central error handling, wired up by Program.cs.</summary>
public static class ErrorHandling
{
    public static IServiceCollection AddApiErrorHandling(this IServiceCollection services)
    {
        services.AddProblemDetails();
        services.AddExceptionHandler<ApiExceptionHandler>();
        // [ApiController] answers unreadable bodies (malformed JSON, wrong types)
        // itself, before any action runs: give those the documented format too,
        // without the serializer's messages (they name internal .NET types).
        services.Configure<ApiBehaviorOptions>(options =>
            options.InvalidModelStateResponseFactory = _ => new BadRequestObjectResult(ApiErrors.UnreadableBody));
        return services;
    }

    public static WebApplication UseApiErrorHandling(this WebApplication app)
    {
        app.UseExceptionHandler();
        return app;
    }
}

/// <summary>The documented error format: { "error": { "code", "message", "fields"? } }.</summary>
public static class ApiErrors
{
    public static object Of(string code, string message) => new { error = new { code, message } };

    public static object Of(string code, string message, IDictionary<string, string[]> fields) =>
        new { error = new { code, message, fields } };

    public static readonly object UnreadableBody = Of(
        "validation_failed",
        "The request body could not be read.",
        new Dictionary<string, string[]>());

    public static readonly object Internal = Of("internal", "An unexpected error occurred.");
}
