// The recitation controls: a sheet to choose reciter, ayahs, repeats and
// speed (and to download a surah for offline), and a slim bar above the tabs
// while a recitation is playing.

import { allChapters, ayahRange, getChapter } from './data';
import parts from '../data/juz-hizb.json';
import { h } from './dom';
import { icon, iconButton, type IconName } from './icons';
import {
  deleteDownload, downloadProgress, downloadSurah, listDownloads, nowPlaying, onPlayer, play, RECITERS,
  reciterById, setSpeed, skip, stop, stopDownload, toggle, type PlayPlan,
} from './recite';

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

/** The last choices, kept between visits. */
type Prefs = Omit<PlayPlan, 'from' | 'to'>;
function loadPrefs(): Prefs {
  const d: Prefs = { reciter: RECITERS[0].id, eachAyah: 1, wholeRange: 1, speed: 1, pause: 0 };
  try { return { ...d, ...JSON.parse(store.get('recite-prefs') ?? '{}') }; } catch { return d; }
}
const savePrefs = (p: Prefs) => store.set('recite-prefs', JSON.stringify(p));

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const EACH = [1, 2, 3, 5, 10, 0];
const RANGE = [1, 2, 3, 5, 0];
const PAUSES = [0, 2, 5, 10];
const times = (n: number) => (n === 0 ? '∞' : `${n}×`);
const speedText = (s: number) => `${s}×`;

function btn(iconName: IconName, label: string, cls = 'btn'): HTMLButtonElement {
  return iconButton(h('button', { type: 'button', class: cls }) as HTMLButtonElement, iconName, label);
}

/** A row of choices, one selected. */
function chips<T>(label: string, values: T[], current: T, text: (v: T) => string, pick: (v: T) => void): HTMLElement {
  const row = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label });
  for (const v of values) {
    const b = h('button', { type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(v === current) }, text(v));
    b.addEventListener('click', () => {
      row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      pick(v);
    });
    row.append(b);
  }
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), row);
}

// ------------------------------------------------------------------ the sheet

let sheet: HTMLElement | null = null;

export function closePlayerSheet(): void { sheet?.remove(); sheet = null; }

type Key = [number, number];
const order = (k: Key) => k[0] * 1000 + k[1];
const parseKey = (key: string): Key => key.split(':').map(Number) as Key;
const lastOf = (surah: number): Key => [surah, getChapter(surah)?.verses_count ?? 1];
/** The juz or hizb (1-based) holding an ayah, from the published boundaries. */
const partOf = (list: string[][], k: Key) => list.findIndex(([f, l]) => order(parseKey(f)) <= order(k) && order(k) <= order(parseKey(l))) + 1;

/** One "Surah · ayah" picker. */
function versePicker(label: string, value: Key, change: (k: Key) => void): { el: HTMLElement; set(k: Key): void; read(): Key } {
  const surah = h('select', { class: 'select', 'aria-label': `${label}: surah` }) as HTMLSelectElement;
  for (const c of allChapters()) surah.append(h('option', { value: String(c.id) }, `${c.id}. ${c.name_complex}`));
  const ayah = h('input', { type: 'number', inputmode: 'numeric', min: '1', class: 'num', 'aria-label': `${label}: ayah` }) as HTMLInputElement;
  const set = (k: Key) => {
    surah.value = String(k[0]);
    ayah.max = String(getChapter(k[0])?.verses_count ?? 1);
    ayah.value = String(k[1]);
  };
  const read = (): Key => {
    const s = Number(surah.value);
    const n = getChapter(s)?.verses_count ?? 1;
    return [s, Math.min(n, Math.max(1, Math.round(Number(ayah.value)) || 1))];
  };
  surah.addEventListener('change', () => { ayah.value = label.startsWith('Ending') ? String(getChapter(Number(surah.value))?.verses_count ?? 1) : '1'; change(read()); });
  ayah.addEventListener('change', () => change(read()));
  set(value);
  const el = h('div', { class: 'verse-picker' }, h('span', { class: 'verse-label' }, label), surah, ayah);
  return { el, set, read };
}

/** Open the recitation settings, starting from an ayah on the given page. */
export function openPlayerSheet(page: number, surah: number, from = 1): void {
  closePlayerSheet();
  const prefs = loadPrefs();
  const plan: { from: Key; to: Key } = { from: [surah, from], to: lastOf(surah) };

  const panel = h('div', { class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Listen' });
  const close = btn('close', 'Close', 'btn icon-only sheet-close');
  close.addEventListener('click', closePlayerSheet);
  panel.append(h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-title' }, 'Listen'), close));

  // Reciter
  const reciters = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Reciter' });
  for (const r of RECITERS) {
    const b = h('button', { type: 'button', role: 'radio', class: 'choice', 'aria-checked': String(prefs.reciter === r.id) },
      h('span', { class: 'choice-text' }, h('span', { class: 'choice-name' }, r.name)));
    b.addEventListener('click', () => {
      reciters.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      prefs.reciter = r.id;
      savePrefs(prefs);
      void renderDownload();
    });
    reciters.append(b);
  }

  // Range: start and end, each any ayah; the end never comes before the start.
  const changed = () => {
    if (order(plan.to) < order(plan.from)) { plan.to = lastOf(plan.from[0]); endPick.set(plan.to); }
    void renderDownload();
  };
  const startPick = versePicker('Starting verse', plan.from, (k) => { plan.from = k; changed(); });
  const endPick = versePicker('Ending verse', plan.to, (k) => {
    plan.to = k;
    if (order(plan.to) < order(plan.from)) { plan.from = [k[0], 1]; startPick.set(plan.from); }
    void renderDownload();
  });
  const setRange = (f: Key, t: Key) => { plan.from = f; plan.to = t; startPick.set(f); endPick.set(t); void renderDownload(); };

  // Quick select, for the page you were on and the surah, juz and hizb it starts in.
  const pageRange = ayahRange(page);
  const startKey: Key = pageRange ? parseKey(pageRange[0]) : [surah, from];
  const juz = partOf(parts.juz, startKey);
  const hizb = partOf(parts.hizb, startKey);
  const quick = h('div', { class: 'quick' });
  const quickBtn = (label: string, f: Key, t: Key) => {
    const b = h('button', { type: 'button', class: 'btn quick-btn' }, label);
    b.addEventListener('click', () => setRange(f, t));
    quick.append(b);
  };
  if (pageRange) {
    quickBtn(`Page ${page}`, parseKey(pageRange[0]), parseKey(pageRange[1]));
    quickBtn(`From page ${page}`, parseKey(pageRange[0]), [114, 6]);
  }
  quickBtn(getChapter(surah)?.name_complex ?? `Surah ${surah}`, [surah, 1], lastOf(surah));
  if (juz) quickBtn(`Juz ${juz}`, parseKey(parts.juz[juz - 1][0]), parseKey(parts.juz[juz - 1][1]));
  if (hizb) quickBtn(`Hizb ${hizb}`, parseKey(parts.hizb[hizb - 1][0]), parseKey(parts.hizb[hizb - 1][1]));
  quickBtn('All', [1, 1], [114, 6]);

  const range = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Select range'), startPick.el, endPick.el);

  // Download for offline: every surah the range touches.
  const download = h('div', { class: 'download-row' });
  const surahsInRange = () => Array.from({ length: plan.to[0] - plan.from[0] + 1 }, (_, i) => plan.from[0] + i);
  let running = false;
  const renderDownload = async () => {
    const r = reciterById(prefs.reciter);
    const list = surahsInRange();
    const one = list.length === 1 ? getChapter(list[0])?.name_complex : null;
    const saved = await listDownloads();
    const done = list.filter((s) => saved.some((d) => d.reciter === r.id && d.surah === s && d.saved >= d.total));
    const bytes = saved.filter((d) => d.reciter === r.id && list.includes(d.surah)).reduce((a, d) => a + d.bytes, 0);
    const job = list.map((s) => downloadProgress(r.id, s)).find(Boolean);
    download.replaceChildren();
    if (job || running) {
      const stopBtn = btn('close', 'Stop', 'btn small');
      stopBtn.addEventListener('click', () => { running = false; list.forEach((s) => stopDownload(r.id, s)); });
      download.append(h('span', { class: 'download-text' }, one
        ? `Downloading ${one}: ${job?.done ?? 0} of ${job?.total ?? '…'}`
        : `Downloading: ${done.length} of ${list.length} surahs saved`), stopBtn);
      window.setTimeout(() => { if (sheet) void renderDownload(); }, 700);
      return;
    }
    if (done.length === list.length) {
      const del = btn('trash', 'Remove', 'btn small');
      del.addEventListener('click', async () => { for (const s of list) await deleteDownload(r.id, s); void renderDownload(); });
      const text = h('span', { class: 'download-text saved' });
      text.innerHTML = `${icon('check')} ${one ?? `All ${list.length} surahs`} saved for offline (${megabytes(bytes)})`;
      download.append(text, del);
      return;
    }
    const get = btn('download', one ? `Download ${one} for offline` : `Download these ${list.length} surahs for offline${done.length ? ` (${done.length} saved)` : ''}`, 'btn small');
    get.addEventListener('click', async () => {
      running = true;
      void renderDownload();
      let error: string | null = null;
      for (const s of list) {
        if (!running) break;
        error = await downloadSurah(r.id, s, () => undefined);
        if (error) break;
      }
      running = false;
      await renderDownload();
      if (error) download.append(h('span', { class: 'download-text error' }, error));
    });
    download.append(get);
  };
  void renderDownload();

  const playBtn = btn('play', 'Play', 'btn solid play-main');
  playBtn.addEventListener('click', () => {
    // Read the boxes themselves: a number just typed may not have been
    // registered yet (iPhone reports it only when the box loses focus).
    let from = startPick.read();
    let to = endPick.read();
    if (order(to) < order(from)) to = from;
    plan.from = from; plan.to = to;
    play({ ...prefs, from, to });
    closePlayerSheet();
  });

  panel.append(
    range,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quick select'), quick),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Reciter'), reciters),
    chips('Repeat each ayah', EACH, prefs.eachAyah, times, (v) => { prefs.eachAyah = v; savePrefs(prefs); }),
    chips('Repeat the whole range', RANGE, prefs.wholeRange, times, (v) => { prefs.wholeRange = v; savePrefs(prefs); }),
    chips('Speed', SPEEDS, prefs.speed, speedText, (v) => { prefs.speed = v; savePrefs(prefs); setSpeed(v); }),
    chips('Quiet after each ayah, to recite it back', PAUSES, prefs.pause, (v) => (v ? `${v} s` : 'Off'), (v) => { prefs.pause = v; savePrefs(prefs); }),
    download,
    playBtn,
  );

  sheet = h('div', { class: 'sheet' }, panel);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closePlayerSheet(); });
  document.body.append(sheet);
  close.focus({ preventScroll: true });
}

export const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

// ------------------------------------------------------------------ the bar

/** Play from one ayah to the end of its surah, with the saved choices. */
export function playFrom(surah: number, ayah: number): void {
  const prefs = loadPrefs();
  play({ ...prefs, from: [surah, ayah], to: [surah, getChapter(surah)?.verses_count ?? ayah] });
}

let currentPage = () => 1;
/** `page` tells the bar which page is in view, for the sheet's quick select. */
export function mountPlayerBar(bar: HTMLElement, page: () => number): void {
  currentPage = page;
  const text = h('button', { type: 'button', class: 'bar-text', 'aria-label': 'Recitation settings' });
  const prev = btn('skipBack', 'Previous ayah', 'icon-only');
  const pp = h('button', { type: 'button', class: 'icon-only bar-play' }) as HTMLButtonElement;
  const next = btn('skipForward', 'Next ayah', 'icon-only');
  const speed = h('button', { type: 'button', class: 'bar-speed', 'aria-label': 'Speed' });
  const end = btn('close', 'Stop', 'icon-only');
  const error = h('p', { class: 'bar-error', role: 'status' });
  bar.append(text, prev, pp, next, speed, end, error);

  prev.addEventListener('click', () => skip(-1));
  next.addEventListener('click', () => skip(1));
  pp.addEventListener('click', toggle);
  end.addEventListener('click', () => { stop(); bar.hidden = true; });
  text.addEventListener('click', () => { const n = nowPlaying(); if (n) openPlayerSheet(currentPage(), n.plan.from[0], n.plan.from[1]); });
  speed.addEventListener('click', () => {
    const n = nowPlaying();
    if (!n) return;
    const s = SPEEDS[(SPEEDS.indexOf(n.plan.speed) + 1) % SPEEDS.length];
    setSpeed(s);
    const prefs = loadPrefs();
    savePrefs({ ...prefs, speed: s });
  });

  onPlayer((n, err) => {
    bar.hidden = !n && !err;
    error.textContent = err ?? '';
    if (!n) { if (err) text.textContent = ''; return; }
    const c = getChapter(n.surah);
    const rounds = [
      n.plan.eachAyah !== 1 ? `${n.ayahRound}/${times(n.plan.eachAyah).replace('×', '')}` : '',
      n.plan.wholeRange !== 1 ? `set ${n.rangeRound}/${times(n.plan.wholeRange).replace('×', '')}` : '',
    ].filter(Boolean).join(' · ');
    text.replaceChildren(
      h('span', { class: 'bar-where' }, n.basmalah ? `${c?.name_complex} · Basmalah` : `${c?.name_complex} ${n.surah}:${n.ayah}`),
      h('span', { class: 'bar-who' }, [reciterById(n.plan.reciter).name, rounds].filter(Boolean).join(' · ')));
    iconButton(pp, n.playing ? 'pause' : 'play', n.playing ? 'Pause' : 'Play');
    speed.textContent = speedText(n.plan.speed);
  });
  bar.hidden = true;
}
