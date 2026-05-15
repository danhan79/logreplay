using System.Text.Json;
using System.Text.Json.Serialization;
using LogReplay.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

builder.Services.AddSingleton<IReadOnlyList<LogEntry>>(_ => MockData.Build());

var app = builder.Build();

var generatedLogs = app.Services.GetRequiredService<IReadOnlyList<LogEntry>>();
app.Logger.LogInformation(
    "Mock data ready: {Count:N0} log entries (seed=0x{Seed:x8}, target={N}/10s window)",
    generatedLogs.Count, MockData.Seed, MockData.LogsPer10sWindow);

app.UseCors();

// GET /api/logs?from=...&to=...&q=...&severities=critical,error
// `q` is a free-text substring matched (case-insensitive) against `message`.
// `severities` is a comma-joined subset of {verbose,info,warn,error,critical};
// omitted / empty means "all severities". Both filters map directly onto
// `where ...` clauses against App Insights / Log Analytics in production.
app.MapGet("/api/logs", (
    DateTimeOffset from,
    DateTimeOffset to,
    string? q,
    string? severities,
    IReadOnlyList<LogEntry> all) =>
{
    var fromUtc = from.UtcDateTime;
    var toUtc   = to.UtcDateTime;

    IEnumerable<LogEntry> hits = all.Where(l => l.Timestamp >= fromUtc && l.Timestamp < toUtc);
    if (!string.IsNullOrWhiteSpace(q))
        hits = hits.Where(l => l.Message.Contains(q, StringComparison.OrdinalIgnoreCase));
    if (!string.IsNullOrWhiteSpace(severities))
    {
        var allow = new HashSet<string>(
            severities.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            StringComparer.OrdinalIgnoreCase);
        hits = hits.Where(l => allow.Contains(l.SeverityLevel));
    }

    return new WindowResponse(
        Logs: hits.ToList(),
        WindowFrom: fromUtc,
        WindowTo: toUtc,
        EstimatedTotalInRange: all.Count
    );
});

app.Run("http://localhost:5057");
