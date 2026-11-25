using RegistrationApi.Data;
using RegistrationApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IAccountRepository, InMemoryAccountRepository>();
builder.Services.AddScoped<RegistrationService>();

var app = builder.Build();

app.MapControllers();

app.Run();
