// =========================================================================
// Mock log stream — synthesized incident scenario.
// Window covered: 2026-04-23 14:00:00 → 18:30:00 UTC
// Incident:       16:10 — 16:14 UTC, checkout-svc 504 burst
// =========================================================================

(function () {
  'use strict';

  const SERVICES = ['gateway', 'cart-svc', 'pricing-svc', 'checkout-svc',
                    'auth-svc', 'notif-svc'];

  const RANGE_START = Date.UTC(2026, 3, 23, 14, 0, 0);
  const RANGE_END   = Date.UTC(2026, 3, 23, 18, 30, 0);
  const INC_START   = Date.UTC(2026, 3, 23, 16, 10, 0);
  const INC_END     = Date.UTC(2026, 3, 23, 16, 14, 0);

  // Seeded PRNG so the mock stream is stable across reloads.
  let _s = 0x9e3779b9;
  function rand() { _s = (_s * 1664525 + 1013904223) | 0; return ((_s >>> 0) % 100000) / 100000; }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

  const all = [];
  let id = 1;

  function emit(t, lvl, svc, msg, extra = {}) {
    const ts = new Date(t).toISOString();
    all.push({
      id: 'L' + (id++).toString(36).padStart(6, '0'),
      timestamp: ts,
      severityLevel: lvl,
      cloud_RoleName: svc,
      message: msg,
      ...extra,
    });
  }

  // ------- Baseline noise across the full 4h30m range -----------------------
  // ~1 log every 0.6s on average outside the incident, ~3-8/s during.
  for (let t = RANGE_START; t < RANGE_END; t += 400 + Math.floor(rand() * 800)) {
    if (t >= INC_START && t < INC_END) continue; // incident block written below
    const svc = pick(SERVICES);
    const r = rand();
    let lvl = 'info', msg;
    if (r < 0.005) { lvl = 'warn'; msg = sampleWarn(svc); }
    else if (r < 0.012) { lvl = 'error'; msg = sampleError(svc); }
    else if (r < 0.15) { lvl = 'verbose'; msg = sampleVerbose(svc); }
    else { msg = sampleInfo(svc); }
    emit(t, lvl, svc, msg, { operation_Id: opIdFor(t) });
  }

  // ------- Incident: 504 burst on checkout-svc -----------------------------
  // The burst seeds an `operation_Id` we can group on in the drawer.
  const opId = '3ab9c1d8-' + Math.floor(rand() * 1e8).toString(16);
  function incidentLog(tOffsetMs, lvl, svc, msg, extra) {
    emit(INC_START + tOffsetMs, lvl, svc, msg, { operation_Id: opId, ...extra });
  }

  // Setup
  incidentLog(  120_000, 'info',  'gateway',      'GET /api/cart/8a44 → 200  (84ms)');
  incidentLog(  120_300, 'info',  'cart-svc',     'cart.fetched user=u_4421 items=3');
  incidentLog(  120_540, 'warn',  'pricing-svc',  'cache MISS pricebook=eu-west key=sku/3389');
  incidentLog(  124_900, 'info',  'checkout-svc', 'session.start id=ck_9912 amt=42.10 cur=EUR',
    { customDimensions: { sessionId: 'ck_9912', amount: 42.10, currency: 'EUR' } });

  // The actual error trigger
  incidentLog(  125_214, 'error', 'checkout-svc',
    'HTTP 504 upstream=payment-proxy timeout=5000ms',
    { customDimensions: {
        sessionId: 'ck_9912', upstream: 'payment-proxy', timeout_ms: 5000,
        statusCode: 504, retry: 0,
      } });

  incidentLog(  125_221, 'error', 'checkout-svc',
    'unhandled System.TimeoutException at PayClient.PostAsync()',
    { customDimensions: {
        sessionId: 'ck_9912', upstream: 'payment-proxy', timeout_ms: 5000, retry: 1,
      },
      exception: {
        type: 'System.TimeoutException',
        message: 'The operation has timed out after 5000ms while POSTing to payment-proxy.',
        stack: [
          'at PayClient.PostAsync(Uri uri, Payload p) in PayClient.cs:line 142',
          'at Checkout.Charge(Session s) in CheckoutHandlers.cs:line 88',
          'at Checkout.HandleStart(Request r) in CheckoutHandlers.cs:line 51',
          'at Microsoft.AspNetCore.Routing.EndpointMiddleware.Invoke(HttpContext ctx)',
          'at Microsoft.AspNetCore.Builder.UseExceptionHandlerExtensions.<>c.Invoke(HttpContext ctx)',
          'at logreplay.demo.RequestPipeline.RunAsync()',
        ].join('\n'),
      }
    });

  incidentLog(  125_310, 'warn',  'gateway',      '5xx burst rate=12/s window=1s svc=checkout-svc');
  incidentLog(  125_488, 'info',  'notif-svc',    'enqueue ops_alert.checkout-503 to=oncall@');
  incidentLog(  125_502, 'verbose','auth-svc',    'jwt.refresh ok user=u_4421 ttl=3600');

  // Retries fail
  incidentLog(  125_661, 'error', 'checkout-svc', 'retry attempt=2/3 op=charge id=ck_9912',
    { customDimensions: { sessionId: 'ck_9912', retry: 2 } });
  incidentLog(  125_880, 'info',  'cart-svc',     'cart.lock released id=u_4421');
  incidentLog(  126_044, 'error', 'checkout-svc', 'retry attempt=3/3 op=charge id=ck_9912 FAILED',
    { customDimensions: { sessionId: 'ck_9912', retry: 3, finalAttempt: true } });
  incidentLog(  126_118, 'error', 'checkout-svc', 'session.abort id=ck_9912 reason=upstream_timeout',
    { customDimensions: { sessionId: 'ck_9912', abortReason: 'upstream_timeout' } });
  incidentLog(  126_221, 'critical','gateway',    'circuit-breaker OPEN svc=payment-proxy');
  incidentLog(  126_402, 'info',  'pricing-svc',  'cache.refill key=sku/3389 src=db (412ms)');

  // Aftermath — sustained 504s for ~3 minutes
  for (let t = 130_000; t < 240_000; t += 250 + Math.floor(rand() * 600)) {
    const r = rand();
    if (r < 0.35) {
      incidentLog(t, 'error', 'checkout-svc',
        'HTTP 504 upstream=payment-proxy timeout=5000ms',
        { customDimensions: { upstream: 'payment-proxy', timeout_ms: 5000, statusCode: 504 } });
    } else if (r < 0.55) {
      incidentLog(t, 'warn', 'gateway', '5xx rate=' + (4 + Math.floor(rand() * 9)) + '/s svc=checkout-svc');
    } else if (r < 0.75) {
      incidentLog(t, 'info', 'gateway', 'GET /api/health → 200  (' + (2 + Math.floor(rand() * 6)) + 'ms)');
    } else {
      incidentLog(t, 'info', pick(['cart-svc', 'auth-svc']), sampleInfo(pick(['cart-svc', 'auth-svc'])));
    }
  }

  // ------- Helpers ----------------------------------------------------------
  function opIdFor(t) {
    // Group nearby logs by 30s windows so the related-list looks realistic.
    return 'op-' + Math.floor(t / 30_000).toString(36);
  }
  function sampleInfo(svc) {
    if (svc === 'gateway')      return 'GET /api/' + pick(['cart','user','catalog','health']) + ' → 200  (' + (5 + Math.floor(rand() * 95)) + 'ms)';
    if (svc === 'cart-svc')     return 'cart.fetched user=u_' + Math.floor(rand()*9999) + ' items=' + Math.floor(rand()*5+1);
    if (svc === 'pricing-svc')  return 'price.lookup sku=sku/' + Math.floor(rand()*9999) + ' result=' + (5 + rand()*40).toFixed(2) + ' EUR';
    if (svc === 'auth-svc')     return 'session.heartbeat id=u_' + Math.floor(rand()*9999);
    if (svc === 'notif-svc')    return 'push.sent to=u_' + Math.floor(rand()*9999) + ' topic=' + pick(['promo','tx','sys']);
    return 'OK';
  }
  function sampleVerbose(svc) { return svc + '.tick ' + Math.floor(rand()*9999); }
  function sampleWarn(svc)    { return svc + ' slow op duration=' + (1200 + Math.floor(rand()*3000)) + 'ms'; }
  function sampleError(svc)   { return svc + ' transient error code=' + pick(['ECONNRESET','EHOSTUNREACH','ETIMEDOUT']); }

  // Sort by time and expose.
  all.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  window.__LOGREPLAY_MOCK_DATA__ = all;
  window.__LOGREPLAY_RANGE__ = {
    from: new Date(RANGE_START),
    to:   new Date(RANGE_END),
    incidentAt: new Date(INC_START + 125_221), // the exception
  };
})();
