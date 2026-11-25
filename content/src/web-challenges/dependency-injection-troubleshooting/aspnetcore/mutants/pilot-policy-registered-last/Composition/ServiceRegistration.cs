using QuoteApi.Services;

namespace QuoteApi.Composition;

public static class ServiceRegistration
{
    public static IServiceCollection AddQuoteApplication(this IServiceCollection services)
    {
        services.AddScoped<QuoteBuilder>();
        services.AddScoped<QuoteService>();

        // Wrong: the last registration wins, so the pilot policy is still injected.
        services.AddSingleton<IDiscountPolicy, VolumeDiscountPolicy>();
        services.AddSingleton<IDiscountPolicy, PilotNoDiscountPolicy>();

        services.AddSingleton<INotificationSender, EmailNotificationSender>();

        return services;
    }
}
