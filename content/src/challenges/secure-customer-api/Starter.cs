using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

/// <summary>The stored customer record (the database entity).</summary>
public sealed class Customer
{
    public required int Id { get; init; }
    /// <summary>The user id of the person who owns this customer account.</summary>
    public required string OwnerUserId { get; init; }
    public required string Name { get; init; }
    public required string Email { get; set; }
    public required string PasswordHash { get; init; }
    public required string TaxId { get; init; }
}

public record UpdateEmailRequest(string? Email);

/// <summary>Stands in for the database. Keep the seed data: the tests rely on it.</summary>
public sealed class CustomerStore
{
    private readonly Lock _gate = new();
    private readonly List<Customer> _customers =
    [
        new() { Id = 1, OwnerUserId = "alice", Name = "Alice Martin", Email = "alice@example.com", PasswordHash = "AQAAAAIAAYagAAAAEHk2v1", TaxId = "NL-123456789B01" },
        new() { Id = 2, OwnerUserId = "bob", Name = "Bob Okafor", Email = "bob@example.com", PasswordHash = "AQAAAAIAAYagAAAAEP0x9Q", TaxId = "DE-987654321" },
        new() { Id = 3, OwnerUserId = "alice", Name = "Martin Consulting BV", Email = "billing@martin.example", PasswordHash = "AQAAAAIAAYagAAAAEc7Lm2", TaxId = "NL-555000111B01" },
    ];

    public IReadOnlyList<Customer> All()
    {
        lock (_gate) return [.. _customers.OrderBy(c => c.Id)];
    }

    public Customer? Find(int id)
    {
        lock (_gate) return _customers.FirstOrDefault(c => c.Id == id);
    }

    /// <summary>Throws ArgumentException for an invalid email, KeyNotFoundException for an unknown id.</summary>
    public void UpdateEmail(int id, string? email)
    {
        var trimmed = email?.Trim() ?? "";
        var at = trimmed.IndexOf('@');
        if (at <= 0 || at != trimmed.LastIndexOf('@') || at == trimmed.Length - 1 || trimmed.Contains(' ') || trimmed.Length > 254)
        {
            throw new ArgumentException($"Invalid email '{email}' for customer {id}.", nameof(email));
        }
        lock (_gate)
        {
            var customer = _customers.FirstOrDefault(c => c.Id == id)
                ?? throw new KeyNotFoundException($"Customer {id} does not exist.");
            customer.Email = trimmed;
        }
    }
}

public static class CustomerApi
{
    public static void ConfigureServices(IServiceCollection services) => services.AddSingleton<CustomerStore>();

    public static void MapEndpoints(IEndpointRouteBuilder app)
    {
        app.MapGet("/customers", (CustomerStore store) => store.All());

        app.MapGet("/customers/{id:int}", (int id, CustomerStore store) =>
            store.Find(id) is { } customer ? Results.Ok(customer) : Results.NotFound());

        app.MapPut("/customers/{id:int}/email", (int id, UpdateEmailRequest request, CustomerStore store) =>
        {
            try
            {
                store.UpdateEmail(id, request.Email);
                return Results.NoContent();
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.ToString(), statusCode: 500);
            }
        });
    }
}
