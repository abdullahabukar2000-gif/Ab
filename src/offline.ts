// Saving the whole mushaf for offline use (on the website version). Pages
// you've opened are saved as you go by the service worker (public/sw.js);
// this saves all of them at once, into the same store, when you ask.

import { glyphsVerified, TOTAL_PAGES } from './data';

const CACHE = 'hifz-app-v1';

export const canWorkOffline = () => 'serviceWorker' in navigator && 'caches' in window;

/** Start the service worker, outside the Claude viewer (it has its own). */
export function registerOffline(): void {
  if (!canWorkOffline() || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js').catch(() => undefined);
}

function files(): string[] {
  const out = ['data/index.json', 'data/clear-quran.json', 'fonts/qcf2/bsml.ttf'];
  for (let c = 0; c * 20 < TOTAL_PAGES; c++) out.push(`data/pages-${String(c).padStart(2, '0')}.json`);
  for (let n = 1; n <= TOTAL_PAGES; n++) if (glyphsVerified(n)) out.push(`fonts/qcf2/p${n}.ttf`);
  return out;
}

/** How many of the mushaf's files are already saved, out of how many. */
export async function mushafSaved(): Promise<[number, number]> {
  const all = files();
  const cache = await caches.open(CACHE);
  let have = 0;
  for (const f of all) if (await cache.match(new URL(f, location.href).href)) have++;
  return [have, all.length];
}

/** Save every page and font. Resolves with an error message, or null. */
export async function saveMushaf(progress: (done: number, total: number) => void): Promise<string | null> {
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  const all = files();
  const cache = await caches.open(CACHE);
  let done = 0;
  let failed = 0;
  for (let i = 0; i < all.length; i += 6) {
    await Promise.all(all.slice(i, i + 6).map(async (f) => {
      const url = new URL(f, location.href).href;
      if (!(await cache.match(url))) {
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res); else failed++;
        } catch { failed++; }
      }
      progress(++done, all.length);
    }));
  }
  return failed ? `${failed} files couldn’t be saved. Try again when you have a good connection.` : null;
}
