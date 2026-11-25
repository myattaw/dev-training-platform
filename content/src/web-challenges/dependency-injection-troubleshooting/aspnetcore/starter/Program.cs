using QuoteApi.Composition;
using QuoteApi.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Infrastructure: one product catalog and one outbox for the whole application.
builder.Services.AddSingleton<ProductCatalog>();
builder.Services.AddSingleton<Outbox>();

// Application services: see Composition/ServiceRegistration.cs.
builder.Services.AddQuoteApplication();

var app = builder.Build();

app.MapControllers();

app.Run();
