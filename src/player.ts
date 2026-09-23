// The recitation controls: a sheet to choose reciter, ayahs, repeats and
// speed (and to download a surah for offline), and a slim bar above the tabs
// while a recitation is playing.

import { allChapters, getChapter } from './data';
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
type Prefs = Omit<PlayPlan, 'surah' | 'from' | 'to'>;
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

/** Open the recitation settings for a surah, starting from an ayah. */
export function openPlayerSheet(surah: number, from = 1): void {
  closePlayerSheet();
  const prefs = loadPrefs();
  const plan = { surah, from, to: getChapter(surah)?.verses_count ?? from };

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
      renderDownload();
    });
    reciters.append(b);
  }

  // Surah and ayahs
  const surahSelect = h('select', { class: 'select', 'aria-label': 'Surah' }) as HTMLSelectElement;
  for (const c of allChapters()) surahSelect.append(h('option', { value: String(c.id) }, `${c.id}. ${c.name_complex}`));
  surahSelect.value = String(surah);
  const fromInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', class: 'num', 'aria-label': 'From ayah' }) as HTMLInputElement;
  const toInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', class: 'num', 'aria-label': 'To ayah' }) as HTMLInputElement;
  const syncRange = () => {
    const count = getChapter(plan.surah)?.verses_count ?? 1;
    fromInput.max = toInput.max = String(count);
    fromInput.value = String(plan.from);
    toInput.value = String(plan.to);
  };
  syncRange();
  surahSelect.addEventListener('change', () => {
    plan.surah = Number(surahSelect.value);
    plan.from = 1;
    plan.to = getChapter(plan.surah)?.verses_count ?? 1;
    syncRange();
    renderDownload();
  });
  const clampInputs = () => {
    const count = getChapter(plan.surah)?.verses_count ?? 1;
    const clamp = (v: number) => Math.min(count, Math.max(1, Math.round(v) || 1));
    plan.from = clamp(Number(fromInput.value));
    plan.to = clamp(Number(toInput.value));
    if (plan.to < plan.from) plan.to = plan.from;
    syncRange();
  };
  fromInput.addEventListener('change', clampInputs);
  toInput.addEventListener('change', clampInputs);

  const range = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Surah and ayahs'),
    surahSelect,
    h('div', { class: 'range-row' }, h('label', {}, 'From ayah ', fromInput), h('label', {}, 'to ', toInput)));

  // Download for offline
  const download = h('div', { class: 'download-row' });
  const renderDownload = async () => {
    const r = reciterById(prefs.reciter);
    const c = getChapter(plan.surah);
    const job = downloadProgress(r.id, plan.surah);
    const mine = (await listDownloads()).find((d) => d.reciter === r.id && d.surah === plan.surah);
    download.replaceChildren();
    if (job) {
      const stopBtn = btn('close', 'Stop', 'btn small');
      stopBtn.addEventListener('click', () => stopDownload(r.id, plan.surah));
      download.append(h('span', { class: 'download-text' }, `Downloading ${c?.name_complex}: ${job.done} of ${job.total}`), stopBtn);
      window.setTimeout(() => { if (sheet) void renderDownload(); }, 700);
      return;
    }
    if (mine && mine.saved >= mine.total) {
      const del = btn('trash', 'Remove', 'btn small');
      del.addEventListener('click', async () => { await deleteDownload(r.id, plan.surah); void renderDownload(); });
      const done = h('span', { class: 'download-text saved' });
      done.innerHTML = `${icon('check')} ${c?.name_complex} is saved for offline (${megabytes(mine.bytes)})`;
      download.append(done, del);
      return;
    }
    const get = btn('download', mine ? 'Finish download' : `Download ${c?.name_complex} for offline`, 'btn small');
    const note = h('span', { class: 'download-text' });
    get.addEventListener('click', async () => {
      get.disabled = true;
      const run = downloadSurah(r.id, plan.surah, () => undefined);
      void renderDownload();
      const error = await run;
      await renderDownload();
      if (error) download.append(h('span', { class: 'download-text error' }, error));
    });
    download.append(get, note);
  };
  void renderDownload();

  const playBtn = btn('play', 'Play', 'btn solid play-main');
  playBtn.addEventListener('click', () => {
    clampInputs();
    play({ ...prefs, ...plan });
    closePlayerSheet();
  });

  panel.append(
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Reciter'), reciters),
    range,
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
  playBtn.focus();
}

export const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

// ------------------------------------------------------------------ the bar

/** Play from one ayah to the end of its surah, with the saved choices. */
export function playFrom(surah: number, ayah: number): void {
  const prefs = loadPrefs();
  play({ ...prefs, surah, from: ayah, to: getChapter(surah)?.verses_count ?? ayah });
}

export function mountPlayerBar(bar: HTMLElement): void {
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
  text.addEventListener('click', () => { const n = nowPlaying(); if (n) openPlayerSheet(n.plan.surah, n.plan.from); });
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
    const c = getChapter(n.plan.surah);
    const rounds = [
      n.plan.eachAyah !== 1 ? `${n.ayahRound}/${times(n.plan.eachAyah).replace('×', '')}` : '',
      n.plan.wholeRange !== 1 ? `set ${n.rangeRound}/${times(n.plan.wholeRange).replace('×', '')}` : '',
    ].filter(Boolean).join(' · ');
    text.replaceChildren(
      h('span', { class: 'bar-where' }, n.basmalah ? `${c?.name_complex} · Basmalah` : `${c?.name_complex} ${n.plan.surah}:${n.ayah}`),
      h('span', { class: 'bar-who' }, [reciterById(n.plan.reciter).name, rounds].filter(Boolean).join(' · ')));
    iconButton(pp, n.playing ? 'pause' : 'play', n.playing ? 'Pause' : 'Play');
    speed.textContent = speedText(n.plan.speed);
  });
  bar.hidden = true;
}
