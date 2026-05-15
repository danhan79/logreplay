// =========================================================================
// TopBar — wordmark, source chip, date range pickers, refresh
// =========================================================================
function TopBar({ from, to, onFromChange, onToChange, sourceLabel, onRefresh }) {
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark">▸</span>
        logreplay
      </div>

      <div className="topbar-sep" />

      <div className="source-chip" title="Configured log source">
        <span className="dot" />
        <span>{sourceLabel}</span>
        <Icon.chevDown style={{ color: 'var(--text-faint)' }} />
      </div>

      <div className="topbar-sep" />

      <DateRange from={from} to={to} onFromChange={onFromChange} onToChange={onToChange} />

      <div className="spacer" />

      <div className="topbar-meta">
        <span>window</span>
        <strong>{fmtDuration(+to - +from)}</strong>
      </div>

      <div className="topbar-sep" />

      <button className="icon-btn" onClick={onRefresh} title="Refresh window (R)">
        <Icon.refresh />
      </button>
    </div>
  );
}

// Native <input type="datetime-local"> displays in local time. Our data is UTC
// and we want WYSIWYG, so we serialize the value as the UTC wall-clock time
// (e.g. 14:00 UTC shows "14:00" in the picker regardless of browser locale)
// and parse it back by appending "Z".
function toLocalInputValue(d) {
  return d ? d.toISOString().slice(0, 16) : '';
}
function fromLocalInputValue(s, fallback) {
  if (!s) return fallback;
  const d = new Date(s + ':00Z');
  return isNaN(+d) ? fallback : d;
}

function DateRange({ from, to, onFromChange, onToChange }) {
  return (
    <div className="daterange">
      <label className="date-input" title="Window start (UTC)">
        <span className="label">from</span>
        <input
          type="datetime-local"
          value={toLocalInputValue(from)}
          onChange={e => onFromChange && onFromChange(fromLocalInputValue(e.target.value, from))}
        />
      </label>
      <span className="date-arrow">→</span>
      <label className="date-input" title="Window end (UTC)">
        <span className="label">to</span>
        <input
          type="datetime-local"
          value={toLocalInputValue(to)}
          onChange={e => onToChange && onToChange(fromLocalInputValue(e.target.value, to))}
        />
      </label>
    </div>
  );
}

// =========================================================================
// Filter bar — one row per severity, each with its own text filter.
// Each enabled row fires its own request server-side; the text input is sent
// as `q` (substring match on `message`) and the severity is sent as a
// single-element `severities=` parameter. In production both map onto `where`
// clauses against App Insights / Log Analytics. Disabled rows stay editable
// so the user can pre-stage a filter before flipping the chip on.
// =========================================================================
const SEV_OPTIONS = [
  { key: 'critical', label: 'CRIT',  dot: 'critical' },
  { key: 'error',    label: 'ERROR', dot: 'error'    },
  { key: 'warn',     label: 'WARN',  dot: 'warn'     },
  { key: 'info',     label: 'INFO',  dot: 'info'     },
  { key: 'verbose',  label: 'DEBUG', dot: 'debug'    },
];

function KqlBar({ qBySeverity, onChangeQ, hitCount, severities, onToggleSeverity }) {
  return (
    <div className="kqlbar">
      <div className="sev-rows" role="group" aria-label="Per-severity filters">
        {SEV_OPTIONS.map(s => {
          const on = severities ? severities.has(s.key) : true;
          return (
            <div key={s.key} className={`sev-row ${on ? 'on' : 'off'}`}>
              <button
                type="button"
                className={`sev-chip ${on ? 'on' : 'off'}`}
                aria-pressed={on}
                title={`${on ? 'Hide' : 'Show'} ${s.label.toLowerCase()} logs`}
                onClick={() => onToggleSeverity && onToggleSeverity(s.key)}
              >
                <span className={`sev-dot ${s.dot}`} />
                {s.label}
              </button>
              <div className="kql-input">
                <span className="glyph"><Icon.search /></span>
                <input
                  type="text"
                  value={qBySeverity ? (qBySeverity[s.key] ?? '') : ''}
                  placeholder={`text filter for ${s.label.toLowerCase()} — e.g. "504", "timeout"`}
                  spellCheck={false}
                  onChange={e => onChangeQ && onChangeQ(s.key, e.target.value)}
                />
                <span className="kql-tag">TEXT</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="topbar-meta kql-hits">
        <strong>{hitCount}</strong>
        <span>{hitCount === 1 ? 'log' : 'logs'} in window</span>
      </div>
    </div>
  );
}

// =========================================================================
// Date / duration formatting
// =========================================================================
function fmtDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())} ` +
         `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(d, withMs = true) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  const pad = n => String(n).padStart(2, '0');
  const base = `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
  if (!withMs) return base;
  return `${base}.${String(dt.getUTCMilliseconds()).padStart(3, '0')}`;
}

window.TopBar = TopBar;
window.KqlBar = KqlBar;
window.fmtDate = fmtDate;
window.fmtTime = fmtTime;
window.fmtDuration = fmtDuration;
