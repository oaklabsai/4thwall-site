/* cue-init — 4THWALL's glue over the vendored cuelume library (cuelume.js).
   Restores the visitor's mute preference, wires the declarative data-cuelume-*
   attributes (delegated → covers dynamically-assembled desk screens), and drops
   a small, unobtrusive mute toggle. Kept separate from cuelume.js so the vendored
   library stays byte-for-byte upstream. Sound is DEFAULT ON but gesture-gated by
   the library (nothing plays before the visitor's first real interaction) and
   one tap silences it for good (localStorage). Load AFTER cuelume.js. */
(function(){
  if (!window.Cuelume) return;
  var KEY = 'cue_mute';
  function muted(){ try { return localStorage.getItem(KEY) === '1'; } catch(e){ return false; } }
  function setMuted(v){ try { localStorage.setItem(KEY, v ? '1' : '0'); } catch(e){} Cuelume.setEnabled(!v); }

  Cuelume.setEnabled(!muted());
  Cuelume.bind();

  // a tiny shorthand any inline script can call for imperative cues (chat reply, deck land)
  window.cue = function(name){ try { Cuelume.play(name); } catch(e){} };

  /* ── centralized interaction cues (delegated → one place covers homepage + both desks) ──
     The map (Drew, 2026-07-18): nav/tabs/cards → tick · primary buttons → press/release ·
     contractor-name hover → whisper. Chat-reply (chime) and deck-land (success) are event-based
     and live inline in each surface. Emergency/911 stays silent — the 911 button (.vm-emg-call,
     a tel: link) is deliberately excluded from every selector below. */
  var SEL_TICK  = '.ar-item,.ar-foot-btn,.abn-btn,.cf-arrow,.cf-dot,.cf-card,.bnav-btn,.ds-item,.tc-pill,.mw-opt,#forkCo,#forkHo';
  var SEL_PRESS = '.res-cta,.composer-send,.tc-send,.prof-call,a[href*="calendar.google"]';
  var SEL_HOVER = '.vname';
  function hit(e, sel){ return e.target && e.target.closest ? e.target.closest(sel) : null; }
  document.addEventListener('click', function(e){ if (hit(e, SEL_TICK)) Cuelume.play('tick'); }, true);
  document.addEventListener('pointerdown', function(e){ if (hit(e, SEL_PRESS)) Cuelume.play('press'); }, true);
  document.addEventListener('pointerup',   function(e){ if (hit(e, SEL_PRESS)) Cuelume.play('release'); }, true);
  // contractor-name hover: fine-pointer only, throttled, so a scan down the feed breathes rather than clicks
  var lastHover = 0;
  document.addEventListener('pointerenter', function(e){
    if (e.pointerType !== 'mouse') return;
    if (!window.matchMedia || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    if (!hit(e, SEL_HOVER)) return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - lastHover < 140) return; lastHover = now;
    Cuelume.play('whisper');
  }, true);

  function svgOn(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'; }
  function svgOff(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>'; }

  function mount(){
    if (document.getElementById('cue-mute')) return;
    var b = document.createElement('button');
    b.id = 'cue-mute'; b.type = 'button';
    b.setAttribute('aria-label', 'Toggle interface sounds');
    var css = document.createElement('style');
    css.textContent = '#cue-mute{position:fixed;left:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:2147483000;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:rgba(24,23,18,.42);color:#efe7d4;cursor:pointer;opacity:.32;transition:opacity .2s,background .2s;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}#cue-mute:hover{opacity:.92}#cue-mute svg{width:17px;height:17px}#cue-mute.cue-off{opacity:.24}@media (max-width:899px){#cue-mute{width:30px;height:30px;left:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 74px)}#cue-mute svg{width:15px;height:15px}}';
    document.head.appendChild(css);
    function paint(){ var m = muted(); b.innerHTML = m ? svgOff() : svgOn(); b.classList.toggle('cue-off', m); }
    paint();
    b.addEventListener('click', function(){
      var next = !muted(); setMuted(next); paint();
      if (!next) Cuelume.play('toggle');   // audible confirmation only when turning ON
    });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
