// =========================================================================
// logreplay — root app. Owns:
//   - the time range (from/to)
//   - the playhead `at`
//   - the text filter (`q`) — free-text substring sent to the API
//   - the cache of fetched 10s windows (drives the buffered scrubber state)
//   - the currently-selected log (drives the drawer)
//
// All fetches go through window.__LOGREPLAY_API__ — see api.js for the
// contract. The mock impl is installed by default.
// =========================================================================

const WINDOW_MS = 10_000; // size of one fetch unit
const MAX_VISIBLE_LOGS = 1000; // cap DOM rows; drop oldest beyond this

function App() {
  // Install API (mock by default).
  const api = React.useMemo(() => {
    if (window.__LOGREPLAY_API__) return window.__LOGREPLAY_API__;
    if (window.__LOGREPLAY_API_CTOR_DEFERRED__) {
      window.__LOGREPLAY_API__ = window.__LOGREPLAY_API_CTOR_DEFERRED__();
      return window.__LOGREPLAY_API__;
    }
    throw new Error('No LogReplayAPI configured. See api.js.');
  }, []);

  // Time range comes from the mock for now; in production this is set
  // by the user via the date pickers.
  const RANGE = window.__LOGREPLAY_RANGE__ || {
    from: new Date(Date.now() - 4 * 3600_000),
    to:   new Date(),
    incidentAt: new Date(Date.now() - 2 * 3600_000),
  };

  // from/to persist across reloads. Playhead `at` is intentionally not
  // persisted — it's a playback position, not a filter. On hydration we clamp
  // it into whatever window we restored so we don't end up outside the range.
  const readStoredDate = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(+d)) return d;
      }
    } catch {}
    return fallback;
  };
  const [from, setFrom] = React.useState(() => readStoredDate('logreplay.from', RANGE.from));
  const [to,   setTo]   = React.useState(() => readStoredDate('logreplay.to',   RANGE.to));
  // Playhead always starts at the beginning of the window on load.
  const [at,   setAt]   = React.useState(() => readStoredDate('logreplay.from', RANGE.from));

  React.useEffect(() => {
    try { localStorage.setItem('logreplay.from', from.toISOString()); } catch {}
  }, [from]);
  React.useEffect(() => {
    try { localStorage.setItem('logreplay.to', to.toISOString()); } catch {}
  }, [to]);
  // Filter state — persisted to localStorage so reloads don't reset it.
  // Each severity has its own text filter; toggling a chip on/off controls
  // whether that severity contributes to fetches and the visible stream.
  const ALL_SEVERITIES = ['critical', 'error', 'warn', 'info', 'verbose'];
  const [qBySeverity, setQBySeverity] = React.useState(() => {
    const empty = Object.fromEntries(ALL_SEVERITIES.map(s => [s, '']));
    try {
      const raw = localStorage.getItem('logreplay.qBySeverity');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          return Object.fromEntries(ALL_SEVERITIES.map(s => [s, typeof obj[s] === 'string' ? obj[s] : '']));
        }
      }
    } catch {}
    return empty;
  });
  const [severities, setSeverities] = React.useState(() => {
    try {
      const raw = localStorage.getItem('logreplay.severities');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch {}
    return new Set(ALL_SEVERITIES);
  });

  React.useEffect(() => {
    try { localStorage.setItem('logreplay.qBySeverity', JSON.stringify(qBySeverity)); } catch {}
  }, [qBySeverity]);
  React.useEffect(() => {
    try { localStorage.setItem('logreplay.severities', JSON.stringify([...severities])); } catch {}
  }, [severities]);

  const setQForSeverity = React.useCallback((sev, value) => {
    setQBySeverity(prev => ({ ...prev, [sev]: value }));
  }, []);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  // Bumped to ask LogList to re-engage follow mode and snap to the tail.
  const [followTick, bumpFollow] = React.useReducer(x => x + 1, 0);

  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(null);

  // Cache of fetched per-severity window slices. Used by the scrubber to show
  // buffered segments and by the fetch effect to dedup.
  const cacheRef = React.useRef(new Map());   // key=`${winCenter}|${severity}|${qForSeverity}`, val=logs[]
  const pendingRef = React.useRef(new Set()); // dedup concurrent fetches
  const [version, bump] = React.useReducer(x => x + 1, 0);

  // Snap a timestamp to the center of its 10s window so we cache predictably.
  const snap = React.useCallback((t) => {
    const ms = +t;
    return Math.floor(ms / WINDOW_MS) * WINDOW_MS + WINDOW_MS / 2;
  }, []);

  const winCenter = React.useMemo(() => snap(at), [at, snap]);

  // Ensure all enabled severities for a window are in the cache. Fans out
  // into one API call per severity (each with its own text filter), runs them
  // in parallel, and dedups against pending fetches.
  const ensureWindow = React.useCallback(async (center) => {
    const tasks = [];
    for (const sev of severities) {
      const qForSev = qBySeverity[sev] ?? '';
      const key = `${center}|${sev}|${qForSev}`;
      if (cacheRef.current.has(key)) continue;
      if (pendingRef.current.has(key)) continue;
      pendingRef.current.add(key);
      tasks.push(
        api.fetchWindow({
          at: new Date(center),
          windowMs: WINDOW_MS,
          q: qForSev,
          severities: [sev],
        })
          .then(res => { cacheRef.current.set(key, res.logs); bump(); })
          .catch(err => { console.error(err); })
          .finally(() => { pendingRef.current.delete(key); })
      );
    }
    if (tasks.length) await Promise.all(tasks);
  }, [api, severities, qBySeverity]);

  // Load the current window into the cache. We no longer store logs in state —
  // the visible list is derived from the whole cache (see `stream` below), so
  // crossing a 10s boundary appends instead of replacing.
  React.useEffect(() => {
    let cancelled = false;

    // Window is fully loaded when every enabled severity has its slice cached.
    let allCached = true;
    for (const sev of severities) {
      const key = `${winCenter}|${sev}|${qBySeverity[sev] ?? ''}`;
      if (!cacheRef.current.has(key)) { allCached = false; break; }
    }
    if (allCached) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const t = setTimeout(async () => {
      await ensureWindow(winCenter);
      if (!cancelled) setLoading(false);
    }, 80);

    return () => { cancelled = true; clearTimeout(t); };
  }, [winCenter, severities, qBySeverity, ensureWindow]);

  // Prefetch the next window during playback so the boundary cross is seamless.
  React.useEffect(() => {
    if (!playing) return;
    const next = winCenter + WINDOW_MS;
    if (next > +to) return;
    ensureWindow(next);
  }, [playing, winCenter, to, ensureWindow]);

  // Real-time playback: tick 50ms wall-clock, advance log-time by 50ms * speed.
  // 1× = real wall-clock rate. Logs reveal at their natural pace because the
  // LogList is filtered to `timestamp <= at` (see visibleLogs below).
  const TICK_MS = 50;
  // Carry sub-millisecond remainder across ticks so very low speeds (e.g.
  // 0.01× = 0.5 ms/tick) still advance — `new Date(+prev + 0.5)` truncates
  // the fraction and would otherwise leave `at` frozen.
  const remainderRef = React.useRef(0);
  React.useEffect(() => {
    if (!playing) return;
    remainderRef.current = 0;
    const id = setInterval(() => {
      setAt(prev => {
        const delta = TICK_MS * speed + remainderRef.current;
        const whole = Math.floor(delta);
        remainderRef.current = delta - whole;
        const next = +prev + whole;
        if (next > +to) { setPlaying(false); return to; }
        return new Date(next);
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, speed, to]);

  // Toggle one severity on/off. Used by both the chip buttons and the
  // a/s/d/f/g keyboard shortcuts below.
  const toggleSeverity = React.useCallback((s) => {
    setSeverities(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }, []);

  // Keyboard shortcuts
  React.useEffect(() => {
    const SEV_KEYS = { a: 'critical', s: 'error', d: 'warn', f: 'info', g: 'verbose' };
    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // don't hijack browser shortcuts
      if (e.key === ' ' && e.shiftKey) { e.preventDefault(); setAt(from); setPlaying(true); }
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key === 'ArrowLeft')  setAt(a => new Date(Math.max(+from, +a - WINDOW_MS * (e.shiftKey ? 6 : 1))));
      else if (e.key === 'ArrowRight') setAt(a => new Date(Math.min(+to,   +a + WINDOW_MS * (e.shiftKey ? 6 : 1))));
      else if (e.key === 'ArrowDown')  { e.preventDefault(); bumpFollow(); }
      else if (e.key === 'q' || e.key === 'Q') {
        // Tighten the window from the left (advance `from`). Shift = 10× step.
        const step = (e.shiftKey ? 10 : 1) * 60_000;
        const next = new Date(Math.min(+to - WINDOW_MS, +from + step));
        setFrom(next);
        setAt(a => +a < +next ? next : a);
      }
      else if (e.key === 'w' || e.key === 'W') {
        // Tighten the window from the right (pull `to` back). Shift = 10× step.
        const step = (e.shiftKey ? 10 : 1) * 60_000;
        const next = new Date(Math.max(+from + WINDOW_MS, +to - step));
        setTo(next);
        setAt(a => +a > +next ? next : a);
      }
      else if (SEV_KEYS[e.key?.toLowerCase()]) toggleSeverity(SEV_KEYS[e.key.toLowerCase()]);
      else if (e.key === 'Escape')     setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [from, to, toggleSeverity]);

  // Stream: every log from every window slice we've fetched whose severity is
  // still enabled AND whose stored text filter still matches the current one
  // for that severity. Merged + sorted + deduped by id. Grows monotonically
  // within the current filter set; flipping filters re-derives from cache.
  const stream = React.useMemo(() => {
    const merged = new Map();
    for (const [k, ls] of cacheRef.current) {
      const idx1 = k.indexOf('|');
      if (idx1 < 0) continue;
      const idx2 = k.indexOf('|', idx1 + 1);
      if (idx2 < 0) continue;
      const sev = k.slice(idx1 + 1, idx2);
      const qInKey = k.slice(idx2 + 1); // q may contain '|'; everything after sev is q
      if (!severities.has(sev)) continue;
      if ((qBySeverity[sev] ?? '') !== qInKey) continue;
      for (const log of ls) merged.set(log.id, log);
    }
    const arr = [...merged.values()];
    arr.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
    return arr;
  }, [version, severities, qBySeverity]);

  // Visible: stream up to the playhead. Severity is filtered server-side as
  // part of the cache key, so no extra client filter is needed here. Capped at
  // MAX_VISIBLE_LOGS — older entries fall off so the DOM doesn't drown.
  const visibleLogs = React.useMemo(() => {
    const atMs = +at;
    const filtered = stream.filter(l => +new Date(l.timestamp) <= atMs);
    return filtered.length > MAX_VISIBLE_LOGS ? filtered.slice(-MAX_VISIBLE_LOGS) : filtered;
  }, [stream, at]);

  // Buffered window centers for the scrubber. Derived from cache, dedup'd
  // across text-filter values (so users see "this window has been touched").
  const bufferedWindows = React.useMemo(() => {
    const set = new Set();
    for (const k of cacheRef.current.keys()) set.add(parseInt(k.split('|')[0], 10));
    return [...set];
  }, [version]);

  // Wire up selecting a log. We deliberately do NOT move the playhead here:
  // rewinding `at` to the clicked log's timestamp would hide every later log
  // (visibleLogs filters by `timestamp <= at`).
  function handleSelect(log) {
    setSelected(log);
  }

  return (
    <div className="app">
      <TopBar
        from={from}
        to={to}
        onFromChange={(d) => {
          setFrom(d);
          setAt(d);          // reset playhead to the start of the new window
        }}
        onToChange={(d) => {
          setTo(d);
          setAt(from);       // reset playhead to the start of the window
        }}
        sourceLabel="App Insights · contoso-api / prod-westeu"
        onRefresh={() => {
          cacheRef.current.clear();
          bump();
          setAt(new Date(+at));
        }}
      />

      <KqlBar
        qBySeverity={qBySeverity}
        onChangeQ={setQForSeverity}
        hitCount={visibleLogs.length}
        severities={severities}
        onToggleSeverity={toggleSeverity}
      />

      <div className="main">
        <LogList
          logs={visibleLogs}
          loading={loading}
          selectedId={selected ? selected.id : null}
          onSelect={handleSelect}
          playing={playing}
          followTick={followTick}
        />
        {selected && (
          <DetailDrawer
            log={selected}
            allLogs={visibleLogs}
            onClose={() => setSelected(null)}
            onSelect={handleSelect}
          />
        )}
      </div>

      <Scrubber
        rangeFrom={from}
        rangeTo={to}
        at={at}
        onAtChange={setAt}
        bufferedWindows={bufferedWindows}
        windowMs={WINDOW_MS}
        playing={playing}
        onPlayPause={() => setPlaying(p => !p)}
        speed={speed}
        onSpeedChange={setSpeed}
        loading={loading}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
