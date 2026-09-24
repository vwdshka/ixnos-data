using IxnosData.Application.Accounts;
using IxnosData.Application.Alerts;
using IxnosData.Application.Items;
using IxnosData.Application.Organisations;
using IxnosData.Application.Search;
using Microsoft.Extensions.DependencyInjection;

namespace IxnosData.Application;

public static class DependencyInjection
{
    // Plain handler classes, no mediator.
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<SearchItemsHandler>();
        services.AddScoped<GetItemHandler>();
        services.AddScoped<GetOrganisationHandler>();
        services.AddScoped<AccountHandler>();
        services.AddScoped<ApiKeyHandler>();
        services.AddScoped<DigestHandler>();
        return services;
    }
}
