using EmployeeApi.Data;
using EmployeeApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IEmployeeRepository, InMemoryEmployeeRepository>();
builder.Services.AddScoped<EmployeeService>();

var app = builder.Build();

app.MapControllers();

app.Run();
