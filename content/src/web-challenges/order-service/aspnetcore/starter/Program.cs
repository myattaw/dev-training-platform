using OrderApi.Data;
using OrderApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<ShopStore>();
builder.Services.AddScoped<OrderService>();

var app = builder.Build();

app.MapControllers();

app.Run();
