using InventoryApi.Data;
using InventoryApi.Errors;
using InventoryApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IItemRepository, InMemoryItemRepository>();
builder.Services.AddSingleton<ISupplierClient, SupplierGatewayClient>();
builder.Services.AddScoped<InventoryService>();
builder.Services.AddApiErrorHandling(); // Errors/ErrorHandling.cs

var app = builder.Build();

app.UseApiErrorHandling(); // Errors/ErrorHandling.cs
app.MapControllers();

app.Run();
