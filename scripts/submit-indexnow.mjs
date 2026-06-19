// Submit our sitemap URLs to IndexNow — the open instant-indexing protocol.
// Pushes URLs to Bing / Copilot / Yandex / DuckDuckGo / Ecosia (and, via Bing's
// index, AI answer engines that lean on it). Google does NOT use IndexNow — its
// discovery still comes from the sitemap + GSC.
//
// Free, official (Bing-backed), no spam risk. Run after any deploy that adds or
// changes URLs:  node scripts/submit-indexnow.mjs
//
// The key file (<KEY>.txt at the site root) must be LIVE before this is accepted —
// IndexNow fetches keyLocation to verify ownership.
import { readFile } from 'node:fs/promises';

const HOST = '4thwall.solutions';
const KEY = '0e88ed67bb031c1afc72f2f13ecc31ed';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const xml = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

if (!urlList.length) {
  console.error('No <loc> URLs found in sitemap.xml — nothing to submit.');
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
});

// 200 OK / 202 Accepted = success. 403 = key file not found/mismatched. 422 = a URL
// doesn't belong to host. 429 = rate limited.
const txt = await res.text();
console.log(`IndexNow: HTTP ${res.status} ${res.statusText} — submitted ${urlList.length} URLs`);
console.log(urlList.map((u) => '  ' + u).join('\n'));
if (txt) console.log('response body:', txt);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
