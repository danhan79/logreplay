// =========================================================================
// LogList — dense terminal-style rendering of LogEntry[].
// =========================================================================

const SEV_LABEL = {
  critical: 'CRIT',
  error:    'ERROR',
  warn:     'WARN',
  info:     'INFO',
  verbose:  'DEBUG',
};

const SEV_CLASS = {
  critical: 'crit',
  error:    'err',
  warn:     'warn',
  info:     'info',
  verbose:  'debug',
};

const SEV_DOT = {
  critical: 'critical',
  error:    'error',
  warn:     'warn',
  info:     'info',
  verbose:  'debug',
};

function LogList({ logs, loading, selectedId, onSelect }) {
  return (
    <div className="loglist">
      <div className="loglist-head">
        <div>timestamp</div>
        <div></div>
        <div>cloud_RoleName</div>
        <div>severity</div>
        <div>message</div>
      </div>
      <div className="loglist-rows">
        {loading && logs.length === 0 && <ShimmerRows count={14} />}
        {!loading && logs.length === 0 && (
          <div className="loglist-empty">
            <div className="mono dim" style={{ fontSize: 13 }}>no logs in this 10s window</div>
            <div className="faint" style={{ fontSize: 11 }}>drag the scrubber or clear the filter</div>
          </div>
        )}
        {logs.map(log => (
          <LogRow
            key={log.id}
            log={log}
            selected={log.id === selectedId}
            onClick={() => onSelect && onSelect(log)}
          />
        ))}
      </div>
    </div>
  );
}

function LogRow({ log, selected, onClick }) {
  const lvl = log.severityLevel || 'info';
  return (
    <div
      className={`logrow lvl-${lvl} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      title={log.message}
    >
      <span className="ts">{fmtTime(log.timestamp)}</span>
      <span className={`sev-dot ${SEV_DOT[lvl]}`} />
      <span className="svc">{log.cloud_RoleName}</span>
      <span className={`tag ${SEV_CLASS[lvl]}`}>{SEV_LABEL[lvl]}</span>
      <span className="msg">{log.message}</span>
    </div>
  );
}

function ShimmerRows({ count = 12 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className="shimmer-row" style={{ opacity: 1 - i * 0.04 }}>
      <div /><div /><div /><div /><div />
    </div>
  ));
}

window.LogList = LogList;
