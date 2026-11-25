namespace OrderHistory.Models;

/// <summary>One page of a sorted list, plus the numbers a client needs to page through it.</summary>
public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount, int TotalPages);
