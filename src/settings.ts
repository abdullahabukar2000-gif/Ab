// Settings: how it looks (theme, verse-by-verse script), where your work is
// kept (account sync, backup and restore), and where the text comes from.

import { ayahWords } from './data';
import { h } from './dom';
import { icon } from './icons';
import { editedCount } from './notes';
import { downloadBackup, readBackup, restoreBackup } from './backup';
import { syncState, type SyncState } from './sync';

export type Mood = 'auto' | 'chalk' | 'sepia' | 'night';
export type Script = 'mushaf' | 'amiri' | 'scheherazade' | 'naskh';

export interface Prefs { mood: Mood; script: Script }

const MOODS: { id: Mood; name: string; note: string }[] = [
  { id: 'auto', name: 'Automatic', note: 'Chalk by day, Night when your device is dark' },
  { id: 'chalk', name: 'Chalk', note: 'Crimson on warm white' },
  { id: 'sepia', name: 'Sepia', note: 'Aged paper, browned ink' },
  { id: 'night', name: 'Night', note: 'Dark and soft, for reading at night' },
];

const SCRIPTS: { id: Script; name: string; family: string }[] = [
  { id: 'mushaf', name: 'Mushaf (King Fahd Complex)', family: '' },
  { id: 'amiri', name: 'Amiri Quran', family: "'Amiri Quran'" },
  { id: 'scheherazade', name: 'Scheherazade New', family: "'Scheherazade New'" },
  { id: 'naskh', name: 'Noto Naskh Arabic', family: "'Noto Naskh Arabic'" },
];

export const scriptFamily = (s: Script) => SCRIPTS.find((x) => x.id === s)?.family ?? '';

export function renderSettings(prefs: Prefs, change: (p: Partial<Prefs>) => void): HTMLElement {
  const root = h('div', { class: 'settings' });

  // --- theme
  const moods = h('div', { class: 'choices moods', role: 'radiogroup', 'aria-label': 'Theme' });
  for (const m of MOODS) {
    const b = h('button', { type: 'button', role: 'radio', class: 'choice', 'aria-checked': String(prefs.mood === m.id) },
      h('span', { class: `swatch swatch-${m.id}`, 'aria-hidden': 'true' }),
      h('span', { class: 'choice-text' }, h('span', { class: 'choice-name' }, m.name), h('span', { class: 'choice-note' }, m.note)));
    b.addEventListener('click', () => change({ mood: m.id }));
    moods.append(b);
  }

  // --- script for verse by verse
  const scripts = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Arabic script in verse by verse' });
  // The sample is real text from the added pages (the opening words of 14:1), never typed here.
  const sampleText = ayahWords('14:1').slice(1, 4).join(' ');
  for (const s of SCRIPTS) {
    const b = h('button', { type: 'button', role: 'radio', class: 'choice', 'aria-checked': String(prefs.script === s.id) },
      h('span', { class: 'choice-text' }, h('span', { class: 'choice-name' }, s.name),
        h('span', { class: 'choice-note' }, s.family ? 'Typed Arabic text' : 'The same letter shapes as the printed page')));
    if (s.family && sampleText) {
      const sample = h('span', { class: 'script-sample', lang: 'ar', dir: 'rtl' }, sampleText);
      sample.style.fontFamily = s.family;
      b.append(sample);
    }
    b.addEventListener('click', () => change({ script: s.id }));
    scripts.append(b);
  }

  root.append(
    section('Theme', moods),
    section('Arabic in verse by verse', scripts,
      h('p', { class: 'setting-note' }, 'The mushaf pages always use the official King Fahd Complex fonts, so they match print exactly.')),
    section('Your work', yourWork()),
    section('Where the text comes from', sources()),
  );
  return root;
}

function section(title: string, ...body: HTMLElement[]): HTMLElement {
  return h('section', { class: 'setting' }, h('h2', { class: 'setting-title' }, title), ...body);
}

const SYNC_TEXT: Record<SyncState, { icon: 'cloud' | 'device'; text: string }> = {
  connecting: { icon: 'cloud', text: 'Connecting to your account…' },
  account: { icon: 'cloud', text: 'Saved to your Claude account. Your groups appear on every device where you open this link, and only you can see them.' },
  browser: { icon: 'device', text: 'Saved in this browser only. Download a backup to keep a copy or move it to another device.' },
};

export function syncLine(): HTMLElement {
  const s = SYNC_TEXT[syncState()];
  const p = h('p', { class: `sync-line sync-${syncState()}` });
  p.innerHTML = icon(s.icon);
  p.append(h('span', {}, s.text));
  return p;
}

export const countText = (count = editedCount()) =>
  count ? `You have changed the groups or written notes on ${count} ayah${count === 1 ? '' : 's'}.` : 'You haven’t changed any groups yet.';

function yourWork(): HTMLElement {
  const wrap = h('div', { class: 'work' });
  const count = editedCount();
  const status = h('p', { class: 'work-status', role: 'status' });
  wrap.append(syncLine(), h('p', { class: 'setting-note work-count' }, countText(count)));

  const actions = h('div', { class: 'work-actions' });
  const save = h('button', { type: 'button', class: 'btn' });
  save.innerHTML = `${icon('download')}<span class="label">Download backup</span>`;
  save.addEventListener('click', async () => { status.textContent = await downloadBackup(); });

  const file = h('input', { type: 'file', accept: '.json,application/json', id: 'restore-file', class: 'visually-hidden' }) as HTMLInputElement;
  const restore = h('label', { class: 'btn', for: 'restore-file' });
  restore.innerHTML = `${icon('upload')}<span class="label">Restore from backup</span>`;
  const confirm = h('div', { class: 'confirm', hidden: '' });

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    const result = await readBackup(chosen);
    if ('error' in result) { status.textContent = result.error; confirm.hidden = true; return; }
    status.textContent = '';
    const yes = h('button', { type: 'button', class: 'btn solid' }, 'Restore');
    const no = h('button', { type: 'button', class: 'btn' }, 'Cancel');
    confirm.replaceChildren(
      h('p', {}, `This backup has your groups or notes for ${result.count} ayah${result.count === 1 ? '' : 's'}. Restoring replaces what’s here for those ayahs; everything else stays.`),
      h('div', { class: 'work-actions' }, yes, no));
    confirm.hidden = false;
    yes.addEventListener('click', () => { restoreBackup(result.notes); confirm.hidden = true; status.textContent = 'Restored.'; });
    no.addEventListener('click', () => { confirm.hidden = true; });
  });

  actions.append(save, restore, file);
  wrap.append(actions, confirm, status);
  return wrap;
}

function sources(): HTMLElement {
  const list = h('ul', { class: 'sources' });
  for (const [what, from] of [
    ['Arabic', 'The official mushaf fonts of the King Fahd Complex, Madinah (one per page, unchanged).'],
    ['Page layout', 'Which word sits on which line: checked against the King Fahd Complex’s own listing and your printed mushaf.'],
    ['Translation', 'The Clear Quran by Dr. Mustafa Khattab, as on quran.com, unchanged.'],
    ['Groups', 'Suggested by matching each part of the translation to the Arabic words it means. Yours to change.'],
  ]) list.append(h('li', {}, h('span', { class: 'source-what' }, what), h('span', {}, from)));
  return list;
}
