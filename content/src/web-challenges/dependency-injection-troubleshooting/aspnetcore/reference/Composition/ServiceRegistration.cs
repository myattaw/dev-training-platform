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
        // QuoteBuilder keeps per-quote state, so it is scoped (one per request). A
        // service that depends on it must not live longer than it: a singleton
        // QuoteService captured the first request's builder for the application's
        // whole lifetime (a captive dependency).
        services.AddScoped<QuoteBuilder>();
        services.AddScoped<QuoteService>();

        // One implementation per service: with several registrations, the container
        // injects the LAST one. The pilot policy is not part of the current rules.
        services.AddSingleton<IDiscountPolicy, VolumeDiscountPolicy>();

        // The notifications controller needs a sender: register the email channel.
        services.AddSingleton<INotificationSender, EmailNotificationSender>();

        return services;
    }
}
