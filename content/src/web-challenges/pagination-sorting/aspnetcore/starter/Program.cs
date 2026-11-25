using OrderHistory.Data;
using OrderHistory.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IOrderRepository, InMemoryOrderRepository>();
builder.Services.AddScoped<OrderService>();

var app = builder.Build();

app.MapControllers();

app.Run();
