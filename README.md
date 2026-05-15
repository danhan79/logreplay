# logreplay

Time-travel debugger for distributed-application logs. Scrub the timeline like a YouTube video and watch logs play back in real time, or jump to any moment and inspect the state of every service around it. Designed against the Azure Application Insights / Log Analytics log shape, but the frontend is backend-agnostic.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ▸ logreplay   ● App Insights · contoso-api / prod-westeu                │
├──────────────────────────────────────────────────────────────────────────┤
│  [CRIT  ●]  text filter for crit ────────────────────────────────── TEXT │
│  [ERROR ●]  text filter for error ─────────────────────────────────  …   │
│  [WARN  ●]  text filter for warn  ─────────────────────────────────  …   │
│  [INFO  ●]  text filter for info  ─────────────────────────────────  …   │
│  [DEBUG ●]  text filter for verbose ───────────────────────────────  …   │
├──────────────────────────────────────────────────────────────────────────┤
│   16:12:05.214  ERROR  checkout-svc   HTTP 504 upstream=payment-proxy …  │
│   16:12:05.221  ERROR  checkout-svc   System.TimeoutException at PayCl…  │
│   …                                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│  ════════════════════━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  14:00                          ●                              18:30     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Repo layout

```
app/   Static frontend (React via CDN + Babel standalone — no build step)
api/   .NET 9 minimal API serving a synthesized incident scenario
```

The frontend talks to the backend over a single endpoint, `GET /api/logs?from=…&to=…&q=…&severities=…`. Both `q` (substring match on `message`) and `severities` (comma-joined subset) are applied server-side so the same UI works against App Insights / Log Analytics in production without pulling four hours of logs over the wire.

---

## Run it locally

Two processes. Start the API first.

```powershell
# 1. API at http://localhost:5057
dotnet run --project api

# 2. Frontend — open app/index.html directly, or serve the folder:
cd app
python -m http.server 5173       # then open http://localhost:5173
```

The mock backend in `api/MockData.cs` ships an incident scenario around **2026-04-23 16:12 UTC** (a `checkout-svc` 504 burst with retries, exceptions, and circuit-breaker trip) so the UI has something to render immediately.

Prerequisites: .NET 9 SDK and a modern browser. No `npm install` step.

---

## Filter model

Each severity has its own row with its own text filter. Toggling a chip on/off controls whether that severity participates in the fetch fan-out:

- Every enabled severity fires one API call per 10s window, each with `severities=<one>` and `q=<that row's text>`.
- The cache is keyed by `(window-center, severity, text-filter)` — toggling one chip off keeps the others' cache slices intact; toggling it back on refetches only that severity.
- All filter state (chip on/off, all five text inputs, and the `from`/`to` range) persists to `localStorage`, so reloads don't reset the workspace.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Step back / forward one 10s window |
| <kbd>⇧←</kbd> / <kbd>⇧→</kbd> | Step back / forward six windows |
| <kbd>q</kbd> / <kbd>w</kbd> | Tighten the visible range from the left / right edge (shift = 10×) |
| <kbd>a</kbd> <kbd>s</kbd> <kbd>d</kbd> <kbd>f</kbd> <kbd>g</kbd> | Toggle critical / error / warn / info / verbose chip |
| <kbd>r</kbd> button | Refresh — clear the cache and re-fetch the current window |
| <kbd>Esc</kbd> | Close detail drawer |

Shortcuts are suppressed while typing in any of the text-filter inputs.

---

## Wiring up a real backend

`app/api-real.js` points at the .NET service shipped in this repo. To swap in your own backend, install a different `window.__LOGREPLAY_API__` before `app.jsx` loads. The contract is documented at the top of `app/api.js` (single method: `fetchWindow({ at, windowMs, q, severities })`). The frontend handles caching, dedup, debouncing, and the buffered-state indicator on the scrubber — your backend only needs to answer "give me the logs in this window matching this filter".

See [`app/README.md`](app/README.md) for the deeper UI architecture, file-by-file responsibilities, and notes on porting to Vite / Next.
