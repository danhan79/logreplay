# logreplay

YouTube-style log replay viewer. Scrub through a past time-window and watch logs play back.

The frontend is **backend-agnostic** — implement a single API class and you're done. Field names follow Azure Application Insights conventions (`severityLevel`, `cloud_RoleName`, `operation_Id`, `customDimensions`, `exception`) but nothing is Azure-specific in the UI; the same shape works for Log Analytics Workspace and any other source.

---

## Run it

Open `index.html` in a browser (or serve the folder). The mock backend in `data-mock.js` ships an incident scenario around **2026-04-23 16:12 UTC** (a `checkout-svc` 504 burst with retries, exceptions, and circuit-breaker trip) so the UI has something to render out of the box.

---

## File layout

```
app/
├── index.html         # entry — pulls everything together
├── styles.css         # design tokens (dark) + all component styles
├── api.js             # LogReplayAPI contract + MockLogReplayAPI
├── data-mock.js       # synthetic incident scenario
├── icons.jsx          # inline SVG icons
├── top-bar.jsx        # brand / source / date range + KQL bar
├── log-list.jsx       # dense terminal-style log table
├── drawer.jsx         # right-side detail panel
├── scrubber.jsx       # the YouTube-style transport bar (the centerpiece)
└── app.jsx            # state, fetching, keyboard shortcuts
```

---

## Wiring up your real backend

Open `api.js` — the contract is documented at the top of the file. Then in `index.html`, **before** `app.jsx` loads, install your impl:

```js
class MyAzureBackend {
  async fetchWindow({ at, windowMs, kql }) {
    const from = new Date(+at - windowMs / 2).toISOString();
    const to   = new Date(+at + windowMs / 2).toISOString();
    const r = await fetch(`/api/logs?from=${from}&to=${to}&kql=${encodeURIComponent(kql)}`);
    const { logs } = await r.json();
    return { logs, windowFrom: new Date(from), windowTo: new Date(to) };
  }
}
window.__LOGREPLAY_API__ = new MyAzureBackend();
```

Make sure each `LogEntry` matches the shape described in `api.js` (the only required fields are `id`, `timestamp`, `severityLevel`, `cloud_RoleName`, `message`).

The frontend handles **caching, dedup, debouncing, and the buffered-state indicator** on the scrubber automatically — your backend only needs to answer "give me the logs in this window".

---

## What the scrubber shows

- **Played** (coral) — everything to the left of the playhead.
- **Cached** (mid-grey solid) — 10s windows that have already been fetched; clicking these is instant.
- **Empty** (dark grey) — not yet fetched.
- **Ticks** — minor every minute, major every 10 minutes.
- **Hover tooltip** — the exact timestamp you'd land on if you click.

The KQL filter is part of the cache key, so changing the filter invalidates only that filter's slice of the cache, not the whole thing.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Step back / forward one 10s window |
| <kbd>⇧←</kbd> / <kbd>⇧→</kbd> | Step back / forward one minute |
| <kbd>Esc</kbd> | Close detail drawer |

---

## Porting to a real React project

Everything is plain React + inline `<script type="text/babel">`. To move to Vite / Next:

1. Convert each `.jsx` `Object.assign(window, …)` export to ES module exports.
2. Convert `api.js` and `data-mock.js` to ES modules.
3. Replace the Babel CDN script tags in `index.html` with a normal Vite entry.
4. Move `styles.css` import into your root entry.

No component has any global side effect beyond `window.X = X`, so the conversion is mechanical.
