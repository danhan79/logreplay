// =========================================================================
// Scrubber — YouTube-style transport bar UNDER the logs.
//   - chunks (10s tick marks)
//   - buffered cached windows shown as solid mid-tone segments
//   - hover tooltip showing target timestamp
//   - drag to scrub, click to jump, play/pause + speed
// =========================================================================
const SPEEDS = [0.01, 0.1, 0.2, 0.5, 1, 2, 4, 10];

function Scrubber({
  rangeFrom, rangeTo, at, onAtChange,
  bufferedWindows = [],   // array of millisecond timestamps (window centers)
  windowMs = 10_000,
  playing, onPlayPause,
  speed, onSpeedChange,
  loading,
}) {
  const railRef = React.useRef(null);
  const [hover, setHover] = React.useState(null); // {x:px, pct, t}
  const [dragging, setDragging] = React.useState(false);

  const span = +rangeTo - +rangeFrom;
  const atPct = ((+at - +rangeFrom) / span) * 100;

  function railPctFromEvent(e) {
    const r = railRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    return { x, pct: (x / r.width) * 100 };
  }

  function tFromPct(pct) {
    return new Date(+rangeFrom + (pct / 100) * span);
  }

  function handleDown(e) {
    setDragging(true);
    const { pct } = railPctFromEvent(e);
    onAtChange(tFromPct(pct));
  }

  React.useEffect(() => {
    if (!dragging) return;
    function move(e) {
      const { pct } = railPctFromEvent(e);
      onAtChange(tFromPct(pct));
    }
    function up() { setDragging(false); }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging, rangeFrom, rangeTo]);

  function handleMove(e) {
    if (dragging) return;
    const { x, pct } = railPctFromEvent(e);
    setHover({ x, pct, t: tFromPct(pct) });
  }

  // Compute buffered ranges (contiguous runs collapsed into segments).
  const segments = React.useMemo(() => {
    if (!bufferedWindows.length) return [];
    const sorted = [...bufferedWindows].sort((a, b) => a - b);
    const segs = [];
    let segStart = sorted[0], segEnd = sorted[0] + windowMs;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] <= segEnd + 1) {
        segEnd = sorted[i] + windowMs;
      } else {
        segs.push([segStart, segEnd]);
        segStart = sorted[i]; segEnd = sorted[i] + windowMs;
      }
    }
    segs.push([segStart, segEnd]);
    return segs.map(([a, b]) => [
      ((a - +rangeFrom) / span) * 100,
      ((b - +rangeFrom) / span) * 100,
    ]);
  }, [bufferedWindows, rangeFrom, rangeTo, windowMs]);

  // Ticks every 10 minutes (major) + 1 minute (minor) feels right on a
  // multi-hour range. We compute positions in % so the rail can resize.
  const ticks = React.useMemo(() => {
    const out = [];
    const start = Math.ceil(+rangeFrom / 60_000) * 60_000;
    const minorEvery = 60_000;       // 1 min
    const majorEvery = 10 * 60_000;  // 10 min
    for (let t = start; t <= +rangeTo; t += minorEvery) {
      const pct = ((t - +rangeFrom) / span) * 100;
      out.push({ pct, major: (t % majorEvery) === 0 });
    }
    return out;
  }, [rangeFrom, rangeTo]);

  // Axis labels: every hour, plus the endpoints. We start strictly AFTER
  // rangeFrom so an hour-aligned start doesn't get a duplicate label on top
  // of the explicit pct=0 entry.
  const axisLabels = React.useMemo(() => {
    const out = [];
    out.push({ pct: 0, label: fmtAxis(rangeFrom) });
    const first = (Math.floor(+rangeFrom / 3_600_000) + 1) * 3_600_000;
    for (let t = first; t < +rangeTo; t += 3_600_000) {
      out.push({
        pct: ((t - +rangeFrom) / span) * 100,
        label: fmtAxis(new Date(t)),
      });
    }
    out.push({ pct: 100, label: fmtAxis(rangeTo) });
    return out;
  }, [rangeFrom, rangeTo]);

  function stepByMs(deltaMs) {
    onAtChange(new Date(Math.max(+rangeFrom, Math.min(+rangeTo, +at + deltaMs))));
  }

  return (
    <div className="scrubber">
      <div className="scrubber-meta">
        <div className="now">
          <span className="pulse" />
          <strong>{fmtFullTs(at)}</strong>
          <span style={{ color: 'var(--text-faint)' }}>· 10s window</span>
        </div>
        <div style={{ color: 'var(--text-faint)' }}>
          {loading ? 'fetching…' : 'idle'}
        </div>
      </div>

      <div
        ref={railRef}
        className="scrubber-rail-wrap"
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <div className="scrubber-rail">
          {/* buffered segments */}
          {segments.map(([a, b], i) => (
            <div
              key={i}
              className="scrubber-buffer"
              style={{ left: `${a}%`, width: `${Math.max(0.4, b - a)}%` }}
            />
          ))}
          {/* played portion */}
          <div className="scrubber-played" style={{ width: `${atPct}%` }} />
        </div>

        {/* ticks */}
        <div className="scrubber-ticks">
          {ticks.map((t, i) => (
            <div
              key={i}
              className={`scrubber-tick ${t.major ? 'major' : 'minor'}`}
              style={{ left: `${t.pct}%` }}
            />
          ))}
        </div>

        {/* hover ghost + tooltip */}
        {hover && !dragging && (
          <>
            <div className="scrubber-ghost" style={{ left: hover.x }} />
            <div
              className="scrubber-tooltip"
              style={{ left: hover.x }}
            >{fmtFullTs(hover.t)}</div>
          </>
        )}

        {/* playhead thumb */}
        <div className="scrubber-thumb" style={{ left: `${atPct}%` }} />
      </div>

      {/* axis labels */}
      <div className="scrubber-axis" style={{ position: 'relative', height: 16 }}>
        {axisLabels.map((a, i) => (
          <span key={i} style={{
            position: 'absolute',
            left: `${a.pct}%`,
            transform: i === 0 ? 'translateX(0)' :
                       i === axisLabels.length - 1 ? 'translateX(-100%)' :
                       'translateX(-50%)',
          }}>{a.label}</span>
        ))}
      </div>

      {/* controls row */}
      <div className="scrubber-controls">
        <div className="transport">
          <button className="icon-btn" onClick={() => stepByMs(-windowMs)} title="Back 10s (←)">
            <Icon.prev />
          </button>
          <button
            className={`icon-btn play ${playing ? 'active' : ''}`}
            onClick={onPlayPause}
            title="Play / pause (Space)"
          >
            {playing ? <Icon.pause /> : <Icon.play />}
          </button>
          <button className="icon-btn" onClick={() => stepByMs(windowMs)} title="Forward 10s (→)">
            <Icon.next />
          </button>
        </div>

        <div className="divider" />

        <div className="speed-picker" role="group" aria-label="Speed">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={s === speed ? 'active' : ''}
              onClick={() => onSpeedChange(s)}
            >
              {s < 0.1 ? s.toFixed(2) + 'x' : s < 1 ? s.toFixed(1) + 'x' : s + 'x'}
            </button>
          ))}
        </div>

        <div className="scrubber-status">
          <span className="legend">
            <span><i className="played" /> played</span>
            <span><i className="cached" /> cached</span>
            <span><i className="empty" /> empty</span>
          </span>
          <span>
            cache <span style={{ color: 'var(--text)' }}>
              {Math.round((bufferedWindows.length * windowMs / span) * 100)}%
            </span> · {bufferedWindows.length} chunks
          </span>
        </div>
      </div>
    </div>
  );
}

function fmtFullTs(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}` +
         `.${String(dt.getUTCMilliseconds()).padStart(3, '0')}`;
}
function fmtAxis(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}

window.Scrubber = Scrubber;
