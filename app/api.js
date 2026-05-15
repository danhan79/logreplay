// =========================================================================
// logreplay — API contract
// =========================================================================
// Implement this against your backend (Azure App Insights, Log Analytics
// Workspace, anything) and pass an instance into the app at boot:
//
//     window.__LOGREPLAY_API__ = new MyBackendAPI({...});
//
// The mock implementation below is what ships with this repo so the UI
// is usable without a server. To wire up real fetches, replace
// `window.__LOGREPLAY_API__` (see app.jsx where it's read).
//
// ------------------------------ Contract ---------------------------------
//
// class LogReplayAPI {
//   /**
//    * Fetch logs inside a single time window.
//    * @param {Object} opts
//    * @param {Date}   opts.at        Center of the window.
//    * @param {number} opts.windowMs  Window size in ms (default 10_000).
//    * @param {string} [opts.q]       Free-text filter; substring match on
//    *                                `message` server-side. Empty / omitted
//    *                                returns the unfiltered window.
//    * @param {Severity[]} [opts.severities]
//    *                                Subset of severity levels to return.
//    *                                Omitted / empty means "all severities".
//    *                                Filter applied server-side.
//    * @returns {Promise<{
//    *   logs: LogEntry[],
//    *   windowFrom: Date,
//    *   windowTo: Date,
//    *   estimatedTotalInRange?: number,  // optional, used in status bar
//    * }>}
//    */
//   async fetchWindow(opts) { ... }
// }
//
// ------------------------------ Shapes -----------------------------------
//
// type Severity = 'verbose' | 'info' | 'warn' | 'error' | 'critical';
//
// interface LogEntry {
//   id:             string;                  // stable across fetches
//   timestamp:      string;                  // ISO 8601, UTC
//   severityLevel:  Severity;
//   cloud_RoleName: string;                  // which service emitted it
//   message:        string;                  // single-line preview
//   operation_Id?:  string;                  // for related-trace grouping
//   customDimensions?: Record<string, unknown>;
//   exception?: {
//     type:    string;
//     message: string;
//     stack?:  string;                       // newline-separated frames
//   };
// }
//
// ------------------------------ Notes ------------------------------------
// - Caching of fetched windows is the CLIENT'S job. The API doesn't need
//   to know what's been fetched before. The UI computes the buffered
//   indicator from a Set of window timestamps it has already requested.
// - Backend implementations should respect `kql` server-side for perf —
//   don't return everything and filter client-side over a 4h range.
// - For the App Insights backend the KQL maps directly onto the
//   `traces` / `exceptions` / `requests` tables.
// =========================================================================

(function () {
  'use strict';

  /**
   * MockLogReplayAPI — synthesizes a realistic incident scenario.
   * The "interesting" 4 minutes are 16:10 — 16:14 (a checkout-svc 504 burst).
   * Outside that window logs are gentle baseline noise.
   */
  class MockLogReplayAPI {
    constructor() {
      // The full data stream is generated once and then sliced per window.
      // In a real backend this is your query layer.
      this._all = window.__LOGREPLAY_MOCK_DATA__ || [];
    }

    async fetchWindow({ at, windowMs = 10_000, q, severities }) {
      // Simulate network latency.
      const latency = 120 + Math.random() * 220;
      await new Promise(r => setTimeout(r, latency));

      const from = new Date(+at - windowMs / 2);
      const to   = new Date(+at + windowMs / 2);

      let logs = this._all.filter(l => {
        const t = +new Date(l.timestamp);
        return t >= +from && t < +to;
      });

      if (q && q.trim()) {
        const needle = q.toLowerCase();
        logs = logs.filter(l => (l.message || '').toLowerCase().includes(needle));
      }

      if (severities && severities.length > 0) {
        const allow = new Set(severities);
        logs = logs.filter(l => allow.has(l.severityLevel));
      }

      return {
        logs,
        windowFrom: from,
        windowTo:   to,
        estimatedTotalInRange: this._all.length,
      };
    }
  }

  // Default: install the mock implementation unless the host already set one.
  if (!window.__LOGREPLAY_API__) {
    window.__LOGREPLAY_API_CTOR_DEFERRED__ = () => new MockLogReplayAPI();
  }

  window.MockLogReplayAPI = MockLogReplayAPI;
})();
