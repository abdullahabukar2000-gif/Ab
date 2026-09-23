// Recitation: plays a range of ayahs by one reciter, one recording per ayah,
// with repeats and speed, and saves surahs for offline only when asked.
//
// Recordings are everyayah.com's per-ayah MP3s (one file per ayah, named
// SSSAAA.mp3), with its quranicaudio.com mirror as a second address. They're
// played straight from the web unless the surah has been downloaded, in which
// case the saved copy plays and no connection is needed.

import { getChapter } from './data';

export interface Reciter { id: string; name: string; folders: string[] }

export const RECITERS: Reciter[] = [
  { id: 'alafasy', name: 'Mishary Alafasy', folders: ['Alafasy_128kbps', 'Alafasy_64kbps'] },
  { id: 'husary', name: 'Mahmoud Khalil Al-Husary', folders: ['Husary_128kbps', 'Husary_64kbps'] },
  { id: 'minshawi', name: 'Muhammad Siddiq Al-Minshawi', folders: ['Minshawy_Murattal_128kbps'] },
  { id: 'muaiqly', name: 'Maher Al-Muaiqly', folders: ['MaherAlMuaiqly128kbps', 'Maher_AlMuaiqly_64kbps'] },
  { id: 'tunaiji', name: 'Khalifa Al-Tunaiji', folders: ['khalefa_al_tunaiji_64kbps'] },
];

const HOSTS = ['https://everyayah.com/data/', 'https://mirrors.quranicaudio.com/everyayah/'];
const SAVED = 'hifz-recitations-v1';

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

export const reciterById = (id: string) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];
const file = (surah: number, ayah: number) => `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

/**
 * Where the source's numbering is off, the file that really holds each ayah
 * (null: the source has no recording of it). Found by comparing every file's
 * length with the ayah lengths and with other reciters (scripts/check-audio*.py).
 * Khalifa Al-Tunaiji, Surah Ibrahim: files 1-50 hold ayahs 2-51, file 51
 * repeats ayah 51, file 52 is ayah 52, and ayah 1 is missing.
 */
const FILE_FIXES: Record<string, Record<number, (ayah: number) => number | null>> = {
  tunaiji: { 14: (a) => (a === 1 ? null : a <= 51 ? a - 1 : 52) },
};
const fileAyah = (r: Reciter, surah: number, ayah: number): number | null => FILE_FIXES[r.id]?.[surah]?.(ayah) ?? ayah;
/** How many ayahs of a surah this reciter's source actually has. */
const recordedCount = (r: Reciter, surah: number) => {
  const n = getChapter(surah)?.verses_count ?? 0;
  let c = 0;
  for (let a = 1; a <= n; a++) if (fileAyah(r, surah, a) !== null) c++;
  return c;
};

// Saved copies made before a fix above hold the wrong ayahs: clear them once.
(async () => {
  try {
    if (localStorage.getItem('recite-fixes') === '1' || !('caches' in window)) return;
    const cache = await caches.open('hifz-recitations-v1');
    for (const req of await cache.keys()) if (/__recitation\/tunaiji\/014/.test(req.url)) await cache.delete(req);
    localStorage.setItem('recite-fixes', '1');
  } catch { /* try again next time */ }
})();

/** Web addresses to try for one ayah, the one that worked last time first. */
function addresses(r: Reciter, surah: number, ayah: number): string[] {
  const real = fileAyah(r, surah, ayah);
  if (real === null) return [];
  ayah = real;
  const all = HOSTS.flatMap((host) => r.folders.map((folder) => `${host}${folder}/`));
  const good = store.get(`recite-base-${r.id}`);
  if (good && all.includes(good)) all.splice(all.indexOf(good), 1), all.unshift(good);
  return all.map((base) => base + file(surah, ayah));
}
const rememberBase = (r: Reciter, url: string) => store.set(`recite-base-${r.id}`, url.slice(0, url.lastIndexOf('/') + 1));

/** The key a saved recording is kept under, whichever address it came from. */
const savedKey = (r: Reciter, surah: number, ayah: number) => new Request(`${location.origin}/__recitation/${r.id}/${file(surah, ayah)}`);

async function savedBlob(r: Reciter, surah: number, ayah: number): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  try {
    const res = await (await caches.open(SAVED)).match(savedKey(r, surah, ayah));
    return res ? await res.blob() : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ downloads

export interface SurahDownload { reciter: string; surah: number; saved: number; total: number; bytes: number }

/** Every surah with any saved recordings, per reciter. */
export async function listDownloads(): Promise<SurahDownload[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open(SAVED);
  const found = new Map<string, SurahDownload>();
  for (const req of await cache.keys()) {
    const m = req.url.match(/__recitation\/([^/]+)\/(\d{3})(\d{3})\.mp3$/);
    if (!m) continue;
    const surah = Number(m[2]);
    const id = `${m[1]}:${surah}`;
    const entry = found.get(id) ?? { reciter: m[1], surah, saved: 0, total: recordedCount(reciterById(m[1]), surah), bytes: 0 };
    entry.saved++;
    const res = await cache.match(req);
    entry.bytes += Number(res?.headers.get('content-length')) || 0;
    found.set(id, entry);
  }
  // The basmalah is kept as Al-Fatihah's first ayah; alone, it isn't a download of Al-Fatihah.
  for (const [id, d] of found) if (d.surah === 1 && d.saved === 1) found.delete(id);
  return [...found.values()].sort((a, b) => a.surah - b.surah || a.reciter.localeCompare(b.reciter));
}

const downloading = new Map<string, { done: number; total: number; stop: boolean }>();
export const downloadProgress = (reciter: string, surah: number) => downloading.get(`${reciter}:${surah}`);

/**
 * Save a whole surah by one reciter for offline listening. Reports progress as
 * it goes; already-saved ayahs are skipped. Resolves with an error message, or
 * null when every ayah is saved.
 */
export async function downloadSurah(reciterId: string, surah: number, progress: (done: number, total: number) => void): Promise<string | null> {
  if (!('caches' in window)) return 'This browser can’t save recordings.';
  const r = reciterById(reciterId);
  const total = getChapter(surah)?.verses_count ?? 0;
  const job = { done: 0, total, stop: false };
  downloading.set(`${r.id}:${surah}`, job);
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  const cache = await caches.open(SAVED);
  // Surahs after the first open with the basmalah, recited from Al-Fatihah's first ayah.
  const needsBasmalah = surah !== 1 && surah !== 9;
  const list: [number, number][] = [...(needsBasmalah ? [[1, 1] as [number, number]] : []),
    ...Array.from({ length: total }, (_, i) => [surah, i + 1] as [number, number])];
  let failed = '';
  for (let i = 0; i < list.length && !job.stop; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async ([s, a]) => {
      const key = savedKey(r, s, a);
      if (fileAyah(r, s, a) !== null && !(await cache.match(key))) {
        let saved = false;
        for (const url of addresses(r, s, a)) {
          try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) continue;
            const blob = await res.blob();
            await cache.put(key, new Response(blob, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(blob.size) } }));
            rememberBase(r, url);
            saved = true;
            break;
          } catch { /* next address */ }
        }
        if (!saved) failed = navigator.onLine ? 'Some ayahs couldn’t be downloaded from this reciter’s source.' : 'You’re offline. Connect to download.';
      }
      if (s === surah) { job.done++; progress(job.done, total); }
    }));
    if (failed) break;
  }
  downloading.delete(`${r.id}:${surah}`);
  return job.stop ? 'Stopped.' : failed || null;
}

export function stopDownload(reciterId: string, surah: number): void {
  const job = downloading.get(`${reciterId}:${surah}`);
  if (job) job.stop = true;
}

export async function deleteDownload(reciterId: string, surah: number): Promise<void> {
  const cache = await caches.open(SAVED);
  for (const req of await cache.keys()) {
    if (req.url.includes(`/__recitation/${reciterId}/${String(surah).padStart(3, '0')}`)) await cache.delete(req);
  }
}

// ------------------------------------------------------------------ playing

export interface PlayPlan {
  reciter: string;
  surah: number;
  from: number;
  to: number;
  /** Times each ayah is recited in a row; 0 = keep repeating. */
  eachAyah: number;
  /** Times the whole range is played; 0 = keep repeating. */
  wholeRange: number;
  speed: number;
  /** Seconds of quiet after each recitation, to recite it back yourself. */
  pause: number;
}

export interface NowPlaying { plan: PlayPlan; ayah: number; ayahRound: number; rangeRound: number; basmalah: boolean; playing: boolean }

type Listener = (now: NowPlaying | null, error?: string) => void;
const listeners = new Set<Listener>();
export function onPlayer(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }

const audio = new Audio();
audio.preload = 'auto';
let now: NowPlaying | null = null;
let blobUrl: string | null = null;
let pauseTimer: number | undefined;
let token = 0;

const tell = (error?: string) => listeners.forEach((fn) => fn(now, error));
export const nowPlaying = () => now;

export function play(plan: PlayPlan): void {
  stop();
  const withBasmalah = plan.from === 1 && plan.surah !== 1 && plan.surah !== 9;
  now = { plan, ayah: plan.from, ayahRound: 1, rangeRound: 1, basmalah: withBasmalah, playing: true };
  start();
}

export function setSpeed(speed: number): void {
  if (!now) return;
  now.plan.speed = speed;
  audio.playbackRate = speed;
  tell();
}

export function toggle(): void {
  if (!now) return;
  if (now.playing) { audio.pause(); clearTimeout(pauseTimer); now.playing = false; tell(); }
  else { now.playing = true; if (audio.src && !audio.ended) void audio.play(); else if (audio.ended) advance(); else start(); tell(); }
}

export function stop(): void {
  token++;
  clearTimeout(pauseTimer);
  audio.pause();
  audio.removeAttribute('src');
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  if (now) { now = null; tell(); }
}

/** Jump to the next (1) or previous (-1) ayah in the range. */
export function skip(direction: 1 | -1): void {
  if (!now) return;
  const next = now.ayah + direction;
  if (next < now.plan.from || next > now.plan.to) return;
  now.ayah = next;
  now.ayahRound = 1;
  now.basmalah = false;
  now.playing = true;
  start();
}

async function start(): Promise<void> {
  if (!now) return;
  const mine = ++token;
  clearTimeout(pauseTimer);
  const r = reciterById(now.plan.reciter);
  const [s, a] = now.basmalah ? [1, 1] : [now.plan.surah, now.ayah];
  tell();
  mediaSession(r);

  if (fileAyah(r, s, a) === null) {
    // No recording of this ayah by this reciter: say so, then carry on.
    const only = now.plan.from === now.plan.to;
    tell(`${r.name}’s recording of ${s}:${a} is missing from the source${only ? '.' : ', so it’s skipped.'}`);
    if (only) { now.playing = false; return; }
    pauseTimer = window.setTimeout(() => {
      if (mine !== token || !now) return;
      advance(true);
    }, 2500);
    return;
  }

  const blob = await savedBlob(r, s, a);
  if (mine !== token) return;
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  const sources = blob ? [(blobUrl = URL.createObjectURL(blob))] : addresses(r, s, a);
  for (const src of sources) {
    audio.src = src;
    audio.playbackRate = now.plan.speed;
    try {
      await audio.play();
      if (!blob) rememberBase(r, src);
      return;
    } catch (e) {
      if (mine !== token) return;
      if ((e as DOMException).name === 'NotAllowedError') { now.playing = false; tell(); return; }
    }
  }
  if (mine !== token) return;
  now.playing = false;
  tell(navigator.onLine ? 'This recording couldn’t be played.' : 'You’re offline and this surah isn’t downloaded for this reciter.');
}

audio.addEventListener('ended', () => {
  if (!now) return;
  const mine = token;
  const after = () => { if (mine === token && now) advance(); };
  const wait = now.basmalah ? 0 : now.plan.pause;
  if (wait > 0) pauseTimer = window.setTimeout(after, wait * 1000); else after();
});

/** Move on after a recitation; `nextAyah` skips this ayah's remaining repeats. */
function advance(nextAyah = false): void {
  if (!now) return;
  const p = now.plan;
  if (now.basmalah) { now.basmalah = false; start(); return; }
  if (!nextAyah && (p.eachAyah === 0 || now.ayahRound < p.eachAyah)) { now.ayahRound++; start(); return; }
  now.ayahRound = 1;
  if (now.ayah < p.to) { now.ayah++; start(); return; }
  if (p.wholeRange === 0 || now.rangeRound < p.wholeRange) {
    now.rangeRound++;
    now.ayah = p.from;
    now.basmalah = p.from === 1 && p.surah !== 1 && p.surah !== 9;
    start();
    return;
  }
  now.playing = false;
  const done = now;
  now = null;
  listeners.forEach((fn) => fn(null));
  void done;
}

/** Lock-screen and headphone controls, where the device offers them. */
function mediaSession(r: Reciter): void {
  const ms = navigator.mediaSession;
  if (!ms || !now) return;
  try {
    ms.metadata = new MediaMetadata({ title: `${getChapter(now.plan.surah)?.name_complex ?? ''} ${now.basmalah ? '' : now.ayah}`.trim(), artist: r.name, album: 'Hifz Mushaf' });
    ms.setActionHandler('play', () => { if (now && !now.playing) toggle(); });
    ms.setActionHandler('pause', () => { if (now?.playing) toggle(); });
    ms.setActionHandler('nexttrack', () => skip(1));
    ms.setActionHandler('previoustrack', () => skip(-1));
  } catch { /* not supported */ }
}
