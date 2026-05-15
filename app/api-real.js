// =========================================================================
// Real LogReplayAPI — talks to the .NET minimal API in ../api/.
// Loaded after api.js so it overrides the deferred mock constructor.
// =========================================================================
(function () {
  'use strict';

  // Point this at wherever the .NET API is serving from.
  const BASE = 'http://localhost:5057';

  window.__LOGREPLAY_API__ = {
    async fetchWindow({ at, windowMs = 10_000, q, severities }) {
      const from = new Date(+at - windowMs / 2).toISOString();
      const to   = new Date(+at + windowMs / 2).toISOString();
      const sev  = severities && severities.length > 0 ? severities.join(',') : '';
      const url  = `${BASE}/api/logs?from=${encodeURIComponent(from)}` +
                   `&to=${encodeURIComponent(to)}` +
                   (q ? `&q=${encodeURIComponent(q)}` : '') +
                   (sev ? `&severities=${encodeURIComponent(sev)}` : '');
      const r = await fetch(url);
      if (!r.ok) throw new Error(`logreplay API ${r.status}: ${await r.text()}`);
      const j = await r.json();
      return {
        logs: j.logs,
        windowFrom: new Date(j.windowFrom),
        windowTo:   new Date(j.windowTo),
        estimatedTotalInRange: j.estimatedTotalInRange,
      };
    },
  };

  // The visible time range. Coupled to MockData.cs in the .NET API — if the
  // backend's data window changes, update these too (or wire up a /api/range
  // endpoint and fetch on boot).
  window.__LOGREPLAY_RANGE__ = {
    from:       new Date(Date.UTC(2026, 3, 23, 14,  0,  0)),
    to:         new Date(Date.UTC(2026, 3, 23, 18, 30,  0)),
    incidentAt: new Date(Date.UTC(2026, 3, 23, 16, 12,  5)),
  };
})();
