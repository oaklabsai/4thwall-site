# Parked Features — Vesta

These were built and working. Parked because they're ahead of where the product is publicly. Do not delete — restore when ready.

---

## Look up a name (`mode=name`)

**What it did:** Homeowner types a contractor's business name. Returns verified record if they're in the network, Google Places listing if not, honest empty state if neither.

**Where the code is:** `enterLookup()` in `vesta.html` — fully functional. Routes `/lookup?q=name&zip=X` on the Supabase edge fn.

**Sidebar button to restore:**
```html
<button type="button" class="vsb-item" id="sb-lookup">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/><circle cx="18.5" cy="16.5" r="3"/><line x1="20.8" y1="18.8" x2="23" y2="21"/>
  </svg>
  Look up a name
</button>
```

**Event listeners to restore:**
```js
$('sb-lookup').addEventListener('click', () => enterLookup(S.mode === 'name' ? S.q : ''));
$('gate-lookup').addEventListener('click', () => enterLookup(''));
```

**Gate door to restore:**
```html
<button type="button" class="pill pill-ghost pill-sm" id="gate-lookup">Look up a name instead</button>
```

**Boot handler to restore (in `boot()`):**
```js
if (mode === 'name'){
  S.zip = zip || savedZip();
  enterLookup(q, { noPush: true });
} else if ...
```

**`applyModeUi` to restore:**
```js
const active = S.mode === 'name' ? 'sb-lookup' : S.mode === 'address' ? 'sb-address' : S.mode === 'myhome' ? 'sb-myhome' : 'sb-find';
['sb-find','sb-lookup','sb-address','sb-myhome'].forEach(id => $(id).classList.toggle('vsb-active', id === active));
```

---

## Check an address (`mode=address`)

**What it did:** Homeowner enters a street address. Returns a summary of verified work at that address — job count, trades, years active, last activity. Address is never stored. Designed for buyers/renters checking a home's maintenance history.

**Where the code is:** `enterAddress()` in `vesta.html` — fully functional. Routes `POST /address` on the Supabase edge fn.

**Sidebar button to restore:**
```html
<button type="button" class="vsb-item" id="sb-address">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z"/><circle cx="12" cy="9" r="2.5"/>
  </svg>
  Check an address
</button>
```

**Event listener to restore:**
```js
$('sb-address').addEventListener('click', () => enterAddress());
```

**Gate door to restore:**
```html
<a class="pill pill-ghost pill-sm" href="/address">Check an address</a>
```

**Boot handler to restore (in `boot()`):**
```js
} else if (mode === 'address'){
  S.zip = zip || savedZip();
  enterAddress({ noPush: true });
}
```

---

## Get it done (`mode=request`)

**What it did:** Homeowner describes a job (trade, urgency, summary, name, email). Vesta routes it to verified pros via SMS relay and listed pros via email intro. Verified pros get an instant text; listed pros get a one-time email with reply-to the homeowner.

**Where the code is:** `enterRequest()` in `vesta.html` — fully functional. Routes `POST /request` on the Supabase edge fn.

**Button to restore (inside `va-head`):**
```html
<button type="button" class="pill pill-orange pill-sm" id="va-req-btn">Get it done <span class="arr">→</span></button>
```

**Event listener to restore:**
```js
$('va-req-btn').addEventListener('click', () => enterRequest({ trade: S.trade }));
```

**Boot handler to restore (in `boot()`):**
```js
} else if (mode === 'request'){
  S.zip = zip || savedZip();
  S.trade = HOME.TRADES.includes(trade) ? trade : '';
  const place = (p.get('place') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 200);
  enterRequest({ noPush: true, trade: S.trade, placeId: place.length >= 8 ? place : undefined });
}
```

---

## HONEST disclaimer

**What it was:** Shown below listed (unverified) contractor results to contextualize the "No verified jobs on Vesta yet" badge.

**Restore by setting:**
```js
const HONEST = '<p class="note"><b>"No verified jobs on Vesta yet"</b> isn\'t an accusation — most pros have never been asked to prove their work this way. It means exactly what it says: nothing here is verified, so ask for references like you always would.</p>';
```

---

## Sign in / Profile (`mode=myhome`)

**What it did:** Homeowner signs in via email magic link (no password). Unlocks a personal home file — claimed records, saved pros, tracked warranties. Sign-in happens inline inside Vesta (no separate page flow). Session stored as `hw_session` in localStorage.

**Where the code is:** `signinPanelHtml()`, `hookSignin()`, `enterMyHome()` in `vesta.html` — fully functional. Routes `POST /signin` and `GET /file` on the Supabase edge fn.

**Sidebar button to restore:**
```html
<button type="button" class="vsb-item" id="sb-myhome">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
  Profile
</button>
```

**Event listeners to restore:**
```js
$('sb-myhome').addEventListener('click', () => enterMyHome());
// Sign in intercept on the foot link:
$('nav-acct').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('/signin')){ e.preventDefault(); enterMyHome(); }
});
```

**applyModeUi to restore:**
```js
$('sb-myhome').classList.toggle('vsb-active', S.mode === 'myhome');
```

**Boot handler to restore (in `boot()`):**
```js
if (mode === 'myhome'){
  S.zip = zip || savedZip();
  enterMyHome({ noPush: true });
} else if ...
```

**ZIP persistence to restore (currently guest-only):** When sign-in is live, `saveZip` / `savedZip` already gate on `HOME.token()` — no changes needed there.

**`signin.html`:** Kept as a minimal redirect shell for magic-link round-trips. When restoring, add back the nav links and remove `noindex` if the page should be discoverable.

