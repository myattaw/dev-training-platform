// Reference solution. Private: used only to prove the tests are correct.
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

/// <summary>What clients may see: never the password hash, tax id or owner.</summary>
public record CustomerDto(int Id, string Name, string Email)
{
    public static CustomerDto From(Customer c) => new(c.Id, c.Name, c.Email);
}

public static class CustomerApi
{
    private const string SupportRole = "support";

    public static void ConfigureServices(IServiceCollection services) => services.AddSingleton<CustomerStore>();

    public static void MapEndpoints(IEndpointRouteBuilder app)
    {
        var customers = app.MapGroup("/customers").RequireAuthorization();

        customers.MapGet("/", (ClaimsPrincipal user, CustomerStore store) =>
            store.All().Where(c => CanRead(user, c)).Select(CustomerDto.From).ToList());

        customers.MapGet("/{id:int}", (int id, ClaimsPrincipal user, CustomerStore store) =>
            store.Find(id) is { } c && CanRead(user, c)
                ? Results.Ok(CustomerDto.From(c))
                // 404, not 403: do not reveal that another person's record exists.
                : Results.NotFound());

        customers.MapPut("/{id:int}/email", (int id, UpdateEmailRequest request, ClaimsPrincipal user, CustomerStore store) =>
        {
            // Authorise before validating, so a 400 never confirms that a record exists.
            var customer = store.Find(id);
            if (customer is null || !CanRead(user, customer)) return Results.NotFound();
            if (!IsOwner(user, customer)) return Results.Forbid();
            try
            {
                store.UpdateEmail(id, request.Email);
                return Results.NoContent();
            }
            catch (ArgumentException)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["email"] = ["Enter an email address such as name@example.com."],
                });
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        });
    }

    private static bool IsOwner(ClaimsPrincipal user, Customer customer) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier) is { } id && id == customer.OwnerUserId;

    private static bool CanRead(ClaimsPrincipal user, Customer customer) =>
        IsOwner(user, customer) || user.IsInRole(SupportRole);
}
