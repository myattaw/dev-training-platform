namespace OrderHistory.Models;

/// <summary>An order as stored and returned by the API. Totals have two decimal places.</summary>
public record Order(int Id, string Customer, decimal Total, DateOnly OrderDate, string Status);
