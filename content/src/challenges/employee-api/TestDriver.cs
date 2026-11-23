// PracStack test driver (read-only). It hosts your EmployeeApi on a loopback port
// inside the sandbox and sends it real HTTP requests; the tests call these methods.
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

public sealed class EmployeeApiClient
{
    private readonly HttpClient _http;

    public EmployeeApiClient()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        EmployeeApi.ConfigureServices(builder.Services);
        var app = builder.Build();
        EmployeeApi.MapEndpoints(app);
        app.StartAsync().GetAwaiter().GetResult();
        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        _http = new HttpClient { BaseAddress = new Uri(address), Timeout = TimeSpan.FromSeconds(5) };
    }

    /// <summary>Sends a request and returns the status code.</summary>
    public int Status(string method, string path, string? body) => (int)Send(method, path, body).Status;

    /// <summary>
    /// Sends a request and returns a value from the JSON response: a dot path such as
    /// "name", "items.0.email" or "errors.email", or "items.length" for an array's length.
    /// Names match case-insensitively. Strings are returned without quotes; a missing value is null.
    /// </summary>
    public string? Field(string method, string path, string? body, string field)
    {
        var (_, text, _) = Send(method, path, body);
        try
        {
            using var doc = JsonDocument.Parse(text);
            var current = doc.RootElement;
            foreach (var part in field.Split('.'))
            {
                if (part == "length" && current.ValueKind == JsonValueKind.Array)
                {
                    return current.GetArrayLength().ToString(System.Globalization.CultureInfo.InvariantCulture);
                }
                if (current.ValueKind == JsonValueKind.Array && int.TryParse(part, out var index))
                {
                    if (index >= current.GetArrayLength()) return null;
                    current = current[index];
                }
                else if (current.ValueKind == JsonValueKind.Object && TryGetProperty(current, part, out var next))
                {
                    current = next;
                }
                else
                {
                    return null;
                }
            }
            return current.ValueKind == JsonValueKind.String ? current.GetString() : current.GetRawText();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Sends a request and returns a response header (e.g. Location), or null.</summary>
    public string? Header(string method, string path, string? body, string name)
    {
        var headers = Send(method, path, body).Headers;
        return headers.TryGetValue(name, out var value) ? value : null;
    }

    private static bool TryGetProperty(JsonElement obj, string name, out JsonElement value)
    {
        foreach (var property in obj.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private (HttpStatusCode Status, string Body, Dictionary<string, string> Headers) Send(
        string method, string path, string? body)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (body is not null) request.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
        using var response = _http.Send(request);
        var text = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        var headers = response.Headers.Concat(response.Content.Headers)
            .ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase);
        if (response.Headers.Location is { } location) headers["Location"] = location.OriginalString;
        return (response.StatusCode, text, headers);
    }
}
