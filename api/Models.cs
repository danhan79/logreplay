namespace LogReplay.Api;

public sealed record LogEntry(
    string Id,
    DateTime Timestamp,
    string SeverityLevel,
    string Cloud_RoleName,
    string Message,
    string? Operation_Id = null,
    Dictionary<string, object?>? CustomDimensions = null,
    ExceptionInfo? Exception = null
);

public sealed record ExceptionInfo(
    string Type,
    string Message,
    string? Stack = null
);

public sealed record WindowResponse(
    IReadOnlyList<LogEntry> Logs,
    DateTime WindowFrom,
    DateTime WindowTo,
    int? EstimatedTotalInRange = null
);
