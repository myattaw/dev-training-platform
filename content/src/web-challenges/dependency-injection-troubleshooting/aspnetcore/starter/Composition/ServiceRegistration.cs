using QuoteApi.Services;

namespace QuoteApi.Composition;

/// <summary>
/// Registers the application services with the dependency injection container.
/// Called from Program.cs.
/// </summary>
public static class ServiceRegistration
{
    public static IServiceCollection AddQuoteApplication(this IServiceCollection services)
    {
        // TODO (support ticket): a second quote "remembers" the lines of earlier quotes.
        services.AddScoped<QuoteBuilder>();
        services.AddSingleton<QuoteService>();

        // TODO (support ticket): large orders never get the volume discount.
        services.AddSingleton<IDiscountPolicy, VolumeDiscountPolicy>();
        services.AddSingleton<IDiscountPolicy, PilotNoDiscountPolicy>();

        // TODO (support ticket): POST /api/notifications answers 500 Internal Server Error.

        return services;
    }
}
