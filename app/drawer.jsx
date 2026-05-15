// =========================================================================
// DetailDrawer — full LogEntry inspector with related-trace navigation.
// =========================================================================

function DetailDrawer({ log, allLogs, onClose, onSelect }) {
  if (!log) return null;

  const lvl = log.severityLevel || 'info';
  const related = (log.operation_Id
    ? allLogs.filter(l => l.operation_Id === log.operation_Id).slice(0, 12)
    : []
  );

  return (
    <aside className="drawer">
      <header className="drawer-head">
        <span className={`sev-dot ${SEV_DOT[lvl]}`} />
        <h2>log detail</h2>
        <span className="dim mono" style={{ fontSize: 11.5 }}>{fmtTime(log.timestamp)}</span>
        <span className="close" onClick={onClose} title="Close (Esc)">
          <Icon.close />
        </span>
      </header>

      <div className="drawer-body">
        <div className={`msg-block ${lvl === 'error' || lvl === 'critical' ? 'error' : ''}`}>
          {log.exception ? (
            <>
              <div style={{ color: 'var(--sev-error)', fontWeight: 500 }}>{log.exception.type}</div>
              <div style={{ color: 'var(--text)', marginTop: 4 }}>{log.exception.message}</div>
            </>
          ) : (
            <div>{log.message}</div>
          )}
        </div>

        <div className="kv">
          <span className="k">cloud_RoleName</span>
          <span className="v">{log.cloud_RoleName}</span>
        </div>

        {log.operation_Id && (
          <div className="kv">
            <span className="k">operation_Id</span>
            <span className="v" style={{ color: 'var(--text-dim)' }}>{log.operation_Id}</span>
          </div>
        )}

        {log.customDimensions && Object.keys(log.customDimensions).length > 0 && (
          <div>
            <div className="k" style={{
              fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--text-faint)', marginBottom: 4,
            }}>customDimensions</div>
            <div className="json"><JsonView value={log.customDimensions} /></div>
          </div>
        )}

        {log.exception && log.exception.stack && (
          <div>
            <div className="k" style={{
              fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--text-faint)', marginBottom: 4,
            }}>stack</div>
            <div className="stack">
              {log.exception.stack.split('\n').map((line, i) => {
                const m = line.match(/^(\s*at\s+)([\w.<>]+)(.*)$/);
                return (
                  <div className="frame" key={i}>
                    {m ? (<>
                      <span style={{ color: 'var(--text-faint)' }}>{m[1]}</span>
                      <span className="fn">{m[2]}</span>
                      <span>{m[3]}</span>
                    </>) : line}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {related.length > 1 && (
          <div>
            <div className="k" style={{
              fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--text-faint)', marginBottom: 6,
            }}>
              related · operation_Id
            </div>
            <div className="related-list">
              {related.map(r => (
                <div
                  key={r.id}
                  className={`related ${r.id === log.id ? 'current' : ''}`}
                  onClick={() => onSelect && onSelect(r)}
                >
                  <span className="ts">{fmtTime(r.timestamp)}</span>
                  <span className={`sev-dot ${SEV_DOT[r.severityLevel || 'info']}`}
                        style={{ alignSelf: 'center' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>{r.cloud_RoleName}</span>
                    {r.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// Compact pretty-printed JSON with token coloring.
function JsonView({ value, indent = 0 }) {
  const pad = '  '.repeat(indent);
  if (value === null) return <span className="b">null</span>;
  if (typeof value === 'boolean') return <span className="b">{String(value)}</span>;
  if (typeof value === 'number')  return <span className="n">{value}</span>;
  if (typeof value === 'string')  return <span className="s">"{value}"</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <>[]</>;
    return (
      <>
        {'['}
        {value.map((v, i) => (
          <div key={i}>{pad}  <JsonView value={v} indent={indent+1}/>{i < value.length-1 ? ',' : ''}</div>
        ))}
        {pad}{']'}
      </>
    );
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return <>{'{}'}</>;
    return (
      <>
        {'{'}
        {keys.map((k, i) => (
          <div key={k}>
            {pad}  <span className="k">"{k}"</span>: <JsonView value={value[k]} indent={indent+1}/>{i < keys.length-1 ? ',' : ''}
          </div>
        ))}
        {pad}{'}'}
      </>
    );
  }
  return <>{String(value)}</>;
}

window.DetailDrawer = DetailDrawer;
