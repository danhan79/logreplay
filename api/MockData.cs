using System.Text;

namespace LogReplay.Api;

public static class MockData
{
    private static readonly string[] Services =
        { "gateway", "cart-svc", "pricing-svc", "checkout-svc", "auth-svc", "notif-svc" };

    public static IReadOnlyList<LogEntry> Build()
    {
        var rangeStart = new DateTime(2026, 4, 23, 14, 0, 0, DateTimeKind.Utc);
        var rangeEnd   = new DateTime(2026, 4, 23, 18, 30, 0, DateTimeKind.Utc);
        var incStart   = new DateTime(2026, 4, 23, 16, 10, 0, DateTimeKind.Utc);
        var incEnd     = new DateTime(2026, 4, 23, 16, 14, 0, DateTimeKind.Utc);

        var rangeStartMs = ToMs(rangeStart);
        var rangeEndMs   = ToMs(rangeEnd);
        var incStartMs   = ToMs(incStart);
        var incEndMs     = ToMs(incEnd);

        var rng = new Prng(0x9e3779b9);
        var all = new List<LogEntry>();
        int idCounter = 1;

        LogEntry Make(long tMs, string lvl, string svc, string msg,
                      string? opId = null,
                      Dictionary<string, object?>? cd = null,
                      ExceptionInfo? exc = null)
            => new(
                Id: "L" + ToBase36(idCounter++).PadLeft(6, '0'),
                Timestamp: DateTime.UnixEpoch.AddMilliseconds(tMs),
                SeverityLevel: lvl,
                Cloud_RoleName: svc,
                Message: msg,
                Operation_Id: opId,
                CustomDimensions: cd,
                Exception: exc
            );

        // -------- Baseline noise across the full 4h30m range ------------------
        // Density: avg ~400ms between logs (~2.5/s, ~40k logs over the range).
        // Distribution: each severity is well-represented so the UI's per-level
        // filters have plenty to chew on outside the incident block.
        //   critical  8%   error 17%   warn 20%   info 33%   verbose 22%
        for (long t = rangeStartMs; t < rangeEndMs; t += 200 + (long)(rng.Next() * 400))
        {
            if (t >= incStartMs && t < incEndMs) continue;
            var svc = Services[(int)(rng.Next() * Services.Length)];
            var r = rng.Next();
            string lvl, msg;
            if (r < 0.08)      { lvl = "critical"; msg = SampleCritical(svc, rng); }
            else if (r < 0.25) { lvl = "error";    msg = SampleError(svc, rng); }
            else if (r < 0.45) { lvl = "warn";     msg = SampleWarn(svc, rng); }
            else if (r < 0.78) { lvl = "info";     msg = SampleInfo(svc, rng); }
            else               { lvl = "verbose";  msg = SampleVerbose(svc, rng); }
            all.Add(Make(t, lvl, svc, msg, opId: OpIdFor(t)));
        }

        // -------- Incident: 504 burst on checkout-svc -------------------------
        var opId = "3ab9c1d8-" + ((long)(rng.Next() * 1e8)).ToString("x");

        LogEntry Inc(long offsetMs, string lvl, string svc, string msg,
                     Dictionary<string, object?>? cd = null,
                     ExceptionInfo? exc = null)
            => Make(incStartMs + offsetMs, lvl, svc, msg, opId: opId, cd: cd, exc: exc);

        all.Add(Inc(120_000, "info", "gateway",     "GET /api/cart/8a44 → 200  (84ms)"));
        all.Add(Inc(120_300, "info", "cart-svc",    "cart.fetched user=u_4421 items=3"));
        all.Add(Inc(120_540, "warn", "pricing-svc", "cache MISS pricebook=eu-west key=sku/3389"));
        all.Add(Inc(124_900, "info", "checkout-svc","session.start id=ck_9912 amt=42.10 cur=EUR",
            cd: new() { ["sessionId"] = "ck_9912", ["amount"] = 42.10, ["currency"] = "EUR" }));

        all.Add(Inc(125_214, "error", "checkout-svc",
            "HTTP 504 upstream=payment-proxy timeout=5000ms",
            cd: new()
            {
                ["sessionId"] = "ck_9912", ["upstream"] = "payment-proxy",
                ["timeout_ms"] = 5000, ["statusCode"] = 504, ["retry"] = 0,
            }));

        all.Add(Inc(125_221, "error", "checkout-svc",
            "unhandled System.TimeoutException at PayClient.PostAsync()",
            cd: new()
            {
                ["sessionId"] = "ck_9912", ["upstream"] = "payment-proxy",
                ["timeout_ms"] = 5000, ["retry"] = 1,
            },
            exc: new ExceptionInfo(
                Type: "System.TimeoutException",
                Message: "The operation has timed out after 5000ms while POSTing to payment-proxy.",
                Stack: string.Join("\n", new[]
                {
                    "at PayClient.PostAsync(Uri uri, Payload p) in PayClient.cs:line 142",
                    "at Checkout.Charge(Session s) in CheckoutHandlers.cs:line 88",
                    "at Checkout.HandleStart(Request r) in CheckoutHandlers.cs:line 51",
                    "at Microsoft.AspNetCore.Routing.EndpointMiddleware.Invoke(HttpContext ctx)",
                    "at Microsoft.AspNetCore.Builder.UseExceptionHandlerExtensions.<>c.Invoke(HttpContext ctx)",
                    "at logreplay.demo.RequestPipeline.RunAsync()",
                }))));

        all.Add(Inc(125_310, "warn",    "gateway",   "5xx burst rate=12/s window=1s svc=checkout-svc"));
        all.Add(Inc(125_488, "info",    "notif-svc", "enqueue ops_alert.checkout-503 to=oncall@"));
        all.Add(Inc(125_502, "verbose", "auth-svc",  "jwt.refresh ok user=u_4421 ttl=3600"));

        all.Add(Inc(125_661, "error", "checkout-svc", "retry attempt=2/3 op=charge id=ck_9912",
            cd: new() { ["sessionId"] = "ck_9912", ["retry"] = 2 }));
        all.Add(Inc(125_880, "info",  "cart-svc",     "cart.lock released id=u_4421"));
        all.Add(Inc(126_044, "error", "checkout-svc", "retry attempt=3/3 op=charge id=ck_9912 FAILED",
            cd: new() { ["sessionId"] = "ck_9912", ["retry"] = 3, ["finalAttempt"] = true }));
        all.Add(Inc(126_118, "error", "checkout-svc", "session.abort id=ck_9912 reason=upstream_timeout",
            cd: new() { ["sessionId"] = "ck_9912", ["abortReason"] = "upstream_timeout" }));
        all.Add(Inc(126_221, "critical", "gateway",     "circuit-breaker OPEN svc=payment-proxy"));
        all.Add(Inc(126_402, "info",     "pricing-svc", "cache.refill key=sku/3389 src=db (412ms)"));

        // -------- Aftermath: sustained 504s for ~3 minutes --------------------
        for (long t = 130_000; t < 240_000; t += 250 + (long)(rng.Next() * 600))
        {
            var r = rng.Next();
            if (r < 0.35)
            {
                all.Add(Inc(t, "error", "checkout-svc",
                    "HTTP 504 upstream=payment-proxy timeout=5000ms",
                    cd: new() { ["upstream"] = "payment-proxy", ["timeout_ms"] = 5000, ["statusCode"] = 504 }));
            }
            else if (r < 0.55)
            {
                all.Add(Inc(t, "warn", "gateway", $"5xx rate={4 + (int)(rng.Next() * 9)}/s svc=checkout-svc"));
            }
            else if (r < 0.75)
            {
                all.Add(Inc(t, "info", "gateway", $"GET /api/health → 200  ({2 + (int)(rng.Next() * 6)}ms)"));
            }
            else
            {
                var svc = new[] { "cart-svc", "auth-svc" }[(int)(rng.Next() * 2)];
                all.Add(Inc(t, "info", svc, SampleInfo(svc, rng)));
            }
        }

        all.Sort((a, b) => a.Timestamp.CompareTo(b.Timestamp));
        return all;
    }

    private static long ToMs(DateTime dt) => (long)(dt - DateTime.UnixEpoch).TotalMilliseconds;

    private static string ToBase36(int n)
    {
        if (n == 0) return "0";
        const string chars = "0123456789abcdefghijklmnopqrstuvwxyz";
        var sb = new StringBuilder();
        while (n > 0) { sb.Insert(0, chars[n % 36]); n /= 36; }
        return sb.ToString();
    }

    private static string OpIdFor(long t) => "op-" + ToBase36((int)(t / 30_000));

    private static string SampleInfo(string svc, Prng rng) => svc switch
    {
        "gateway"     => $"GET /api/{new[]{"cart","user","catalog","health"}[(int)(rng.Next()*4)]} → 200  ({5 + (int)(rng.Next()*95)}ms)",
        "cart-svc"    => $"cart.fetched user=u_{(int)(rng.Next()*9999)} items={(int)(rng.Next()*5+1)}",
        "pricing-svc" => $"price.lookup sku=sku/{(int)(rng.Next()*9999)} result={(5 + rng.Next()*40).ToString("F2", System.Globalization.CultureInfo.InvariantCulture)} EUR",
        "auth-svc"    => $"session.heartbeat id=u_{(int)(rng.Next()*9999)}",
        "notif-svc"   => $"push.sent to=u_{(int)(rng.Next()*9999)} topic={new[]{"promo","tx","sys"}[(int)(rng.Next()*3)]}",
        _             => "OK"
    };

    private static string SampleVerbose(string svc, Prng rng) => $"{svc}.tick {(int)(rng.Next()*9999)}";
    private static string SampleWarn(string svc, Prng rng)    => $"{svc} slow op duration={1200 + (int)(rng.Next()*3000)}ms";
    private static string SampleError(string svc, Prng rng)
        => $"{svc} transient error code={new[]{"ECONNRESET","EHOSTUNREACH","ETIMEDOUT"}[(int)(rng.Next()*3)]}";

    private static string SampleCritical(string svc, Prng rng) => svc switch
    {
        "gateway"      => $"connection pool depleted ({180 + (int)(rng.Next()*20)}/200) — backpressure engaged",
        "cart-svc"     => $"redis primary unreachable — cluster degraded for {10 + (int)(rng.Next()*120)}s",
        "pricing-svc"  => $"kafka broker {1 + (int)(rng.Next()*5)} offline — events buffering to disk",
        "checkout-svc" => $"deadlock detected in db tx batch={(int)(rng.Next()*9999)} — aborting",
        "auth-svc"     => $"cert chain validation FAILED — falling back to leaf-only verification",
        "notif-svc"    => $"sms provider quota exhausted — notifications dropping",
        _              => $"unrecoverable error in {svc}"
    };
}

internal sealed class Prng
{
    private uint _s;
    public Prng(uint seed) { _s = seed; }
    public double Next()
    {
        _s = unchecked(_s * 1664525U + 1013904223U);
        return (_s % 100000U) / 100000.0;
    }
}
