using TaskApi.Data;
using TaskApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<TaskRepository>();
builder.Services.AddScoped<TaskService>();

var app = builder.Build();

app.MapControllers();

app.Run();
