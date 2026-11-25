using QuoteApi.Services;

namespace QuoteApi.Composition;

public static class ServiceRegistration
{
    public static IServiceCollection AddQuoteApplication(this IServiceCollection services)
    {
        // Wrong: a transient builder is still captured once by the singleton service.
        services.AddTransient<QuoteBuilder>();
        services.AddSingleton<QuoteService>();

        services.AddSingleton<IDiscountPolicy, VolumeDiscountPolicy>();
        services.AddSingleton<INotificationSender, EmailNotificationSender>();

        return services;
    }
}
