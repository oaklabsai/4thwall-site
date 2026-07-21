// Lightweight per-instance rate limiter (2026-07-20 hemisphere-hardening). Defense-in-depth
// for the two PUBLIC, unauthenticated chat endpoints (/api/triage, /api/atlas) — they share
// ONE 5-key NIM pool, so an unthrottled flood from one source drains it and degrades BOTH
// brains at once.
//
// Mechanism: a module-level sliding-window counter. On Vercel it lives in a warm instance's
// memory, so it reliably defeats the single-connection hammer at zero cost / zero infra.
// It is deliberately NOT a complete DDoS defense: under a distributed flood Vercel scales
// out instances and each keeps its own counter, diluting the per-IP limit. The belt-and-
// suspenders layer for that is a platform WAF rule (plan-gated — Drew's door). This is the
// code-only floor under that.
//
// FAIL-OPEN by construction: a missing IP, a parse slip, anything unexpected → the request
// is allowed. A limiter must never be the reason a real homeowner or contractor can't talk.
const WINDOW_MS = 60_000;
const LIMIT = 25;              // requests per IP per window — generous for a human turn cadence,
                               // painful for a script (a real chat is ~1 send / few seconds)
const hits = new Map();        // ip -> { n, start }
let lastPrune = 0;

export function clientIp(req){
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return (req && req.headers && req.headers['x-real-ip'])
      || (req && req.socket && req.socket.remoteAddress) || null;
}

// true = ALLOW, false = rate-limited. (Date.now is fine here — this is a Vercel route,
// not a Workflow script; the workflow-script clock restriction does not apply.)
export function rateOk(req){
  try {
    const ip = clientIp(req);
    if (!ip) return true;                                    // unidentifiable → fail open
    const now = Date.now();
    if (now - lastPrune > WINDOW_MS){                        // keep the Map from growing unbounded
      for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
      lastPrune = now;
    }
    const e = hits.get(ip);
    if (!e || now - e.start > WINDOW_MS){ hits.set(ip, { n: 1, start: now }); return true; }
    e.n++;
    return e.n <= LIMIT;
  } catch { return true; }                                   // fail open, always
}
