using ExpenseApi.Data;
using ExpenseApi.Security;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IdentityStore>();
builder.Services.AddSingleton<ReportRepository>();

var app = builder.Build();

// Runs for every request, before the controllers.
app.UseMiddleware<BearerTokenMiddleware>();

app.MapControllers();

app.Run();
