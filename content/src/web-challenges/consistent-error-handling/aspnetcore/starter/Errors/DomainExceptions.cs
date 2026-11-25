namespace InventoryApi.Errors;

// Exceptions the services throw on purpose. Their messages are written for API
// clients and are safe to return. Any other exception is unexpected: its message
// and details are internal and must never reach a client.

/// <summary>The requested item does not exist (404, code not_found).</summary>
public class NotFoundException(string message) : Exception(message);

/// <summary>The request conflicts with the current state, e.g. not enough stock (409, code conflict).</summary>
public class ConflictException(string message) : Exception(message);

/// <summary>Invalid input (400, code validation_failed). Fields maps field name → messages.</summary>
public class InvalidInputException(IDictionary<string, string[]> fields)
    : Exception("One or more fields are invalid.")
{
    public IDictionary<string, string[]> Fields { get; } = fields;
}
