using ProductCatalog.Data;
using ProductCatalog.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IProductRepository, InMemoryProductRepository>();
builder.Services.AddScoped<ProductSearchService>();

var app = builder.Build();

app.MapControllers();

app.Run();
