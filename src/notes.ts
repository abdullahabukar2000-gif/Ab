// The memoriser's own layer: where each ayah breaks into phrases, and each
// phrase's meaning and note. Kept apart from the page data so re-ingesting a
// page never touches it.
//
// `breaks` are word indices (0-based, end markers excluded) that END a
// phrase. Phrase data is keyed by the phrase's first word index. Joining two
// phrases leaves the second one's data in place, unused, so splitting at the
// same spot again brings it back.
//
// An ayah with no saved note uses the suggested grouping. The first edit
// saves the suggestion along with the change, so later improvements to the
// suggester never move phrases that already have writing attached.
//
// Every note carries `updatedAt`, so copies from several devices (see
// sync.ts) and restored backups merge newest-wins per ayah. Going back to the
// suggestion leaves a `deleted` marker rather than nothing, so the reset
// travels to other devices too.

import { ayahWords, meaningEnds } from './data';
import { suggestBreaks } from './suggest';

export interface PhraseData { meaning: string; note: string }

export interface Note {
  verseKey: string;
  breaks: number[];
  phrases: Record<string, PhraseData>;
  updatedAt: number;
  deleted?: boolean;
}

export interface Phrase extends PhraseData { start: number; end: number; index: number }

const notes = new Map<string, Note>();

// This browser's copy: shown instantly, and all there is when the account isn't reachable.
const STORAGE_KEY = 'mushaf-notes-v2';
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Note>;
  for (const n of Object.values(saved)) if (isNote(n)) notes.set(n.verseKey, { ...n, updatedAt: n.updatedAt ?? 0 });
} catch { /* unavailable or unreadable: start from suggestions */ }

export function isNote(n: unknown): n is Note {
  const x = n as Note;
  return !!x && typeof x.verseKey === 'string' && /^\d{1,3}:\d{1,3}$/.test(x.verseKey)
    && Array.isArray(x.breaks) && x.breaks.every((b) => Number.isInteger(b))
    && typeof x.phrases === 'object' && x.phrases !== null;
}

function saveLocal(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(notes))); } catch { /* private mode */ }
}

const listeners = new Set<(verseKey: string) => void>();
/** Hears every change, local or merged in; the key is '*' for a bulk merge. */
export function onChange(fn: (verseKey: string) => void): void { listeners.add(fn); }
const localWriters = new Set<() => void>();
/** Hears only the memoriser's own edits here, for pushing them to the account. */
export function onLocalWrite(fn: () => void): void { localWriters.add(fn); }

function persist(key: string): void {
  const note = notes.get(key);
  if (note) note.updatedAt = Date.now();
  saveLocal();
  listeners.forEach((fn) => fn(key));
  localWriters.forEach((fn) => fn());
}

/** Everything, tombstones included, for syncing and backups. */
export function allNotes(): Record<string, Note> { return Object.fromEntries(notes); }

/** How many ayahs carry the memoriser's own grouping or writing. */
export function editedCount(): number { return [...notes.values()].filter((n) => !n.deleted).length; }

/**
 * Bring in notes from elsewhere. `newer`: keep whichever copy of each ayah
 * was changed last (syncing). `incoming`: the incoming copy wins (restoring a
 * backup) and is stamped now, so it wins on other devices too.
 * Reports whether anything here changed and whether this copy holds anything
 * the incoming set lacks or has older.
 */
export function mergeNotes(incoming: Record<string, unknown>, mode: 'newer' | 'incoming'): { changed: boolean; localAhead: boolean } {
  let changed = false;
  const now = Date.now();
  for (const n of Object.values(incoming)) {
    if (!isNote(n)) continue;
    const mine = notes.get(n.verseKey);
    if (mode === 'incoming') { notes.set(n.verseKey, { ...n, updatedAt: now }); changed = true; continue; }
    if (!mine || (n.updatedAt ?? 0) > mine.updatedAt) { notes.set(n.verseKey, { ...n, updatedAt: n.updatedAt ?? 0 }); changed = true; }
  }
  const localAhead = mode === 'incoming' || [...notes.values()].some((mine) => {
    const theirs = incoming[mine.verseKey] as Note | undefined;
    return !theirs || (theirs.updatedAt ?? 0) < mine.updatedAt;
  });
  if (changed) { saveLocal(); listeners.forEach((fn) => fn('*')); }
  if (mode === 'incoming') localWriters.forEach((fn) => fn());
  return { changed, localAhead };
}

const live = (key: string) => { const n = notes.get(key); return n && !n.deleted ? n : undefined; };

const suggestions = new Map<string, number[]>();
export function suggested(key: string): number[] {
  let s = suggestions.get(key);
  // Meaning groups matched to the translation where they exist; otherwise the
  // pause-sign and phrase-length guess.
  if (!s) {
    s = meaningEnds(key)?.slice(0, -1) ?? suggestBreaks(ayahWords(key));
    // Only remembered once the ayah's page has loaded and there were words to group.
    if (ayahWords(key).length) suggestions.set(key, s);
  }
  return s;
}

export const wordCount = (key: string) => ayahWords(key).length;

/** True while the ayah is still grouped as suggested (whether or not anything is written). */
export function usesSuggestion(key: string): boolean {
  const note = live(key);
  return !note || note.breaks.join() === suggested(key).join();
}

export function phrasesOf(key: string): Phrase[] {
  const count = wordCount(key);
  const note = live(key);
  const ends = [...new Set((note?.breaks ?? suggested(key)).filter((b) => b >= 0 && b < count - 1))].sort((a, b) => a - b);
  ends.push(count - 1);
  let start = 0;
  return ends.map((end, index) => {
    const data = note?.phrases[start] ?? { meaning: '', note: '' };
    const phrase = { meaning: data.meaning, note: data.note, start, end, index };
    start = end + 1;
    return phrase;
  });
}

export function phraseAt(key: string, wordIndex: number): Phrase | undefined {
  return phrasesOf(key).find((p) => wordIndex >= p.start && wordIndex <= p.end);
}

function ensure(key: string): Note {
  let note = live(key);
  if (!note) { note = { verseKey: key, breaks: [...suggested(key)], phrases: {}, updatedAt: 0 }; notes.set(key, note); }
  return note;
}

/** Split after word `index`, or join there if it's already split. */
export function toggleBreak(key: string, index: number): void {
  if (index < 0 || index >= wordCount(key) - 1) return;
  const note = ensure(key);
  const at = note.breaks.indexOf(index);
  if (at === -1) note.breaks.push(index); else note.breaks.splice(at, 1);
  note.breaks.sort((a, b) => a - b);
  persist(key);
}

/**
 * Move the end of the phrase that ends at word `from` to word `to`. If that
 * empties either neighbouring phrase, the two are joined instead.
 */
export function moveBreak(key: string, from: number, to: number): void {
  const note = ensure(key);
  const at = note.breaks.indexOf(from);
  if (at === -1 || to === from) return;
  const prev = at > 0 ? note.breaks[at - 1] : -1;
  const next = at < note.breaks.length - 1 ? note.breaks[at + 1] : wordCount(key) - 1;
  if (to <= prev || to >= next) note.breaks.splice(at, 1);
  else note.breaks[at] = to;
  persist(key);
}

/** Go back to the suggested grouping, keeping anything written against phrases that still exist. */
export function resetToSuggested(key: string): void {
  const note = live(key);
  if (!note) return;
  const hasWriting = Object.values(note.phrases).some((p) => p.meaning || p.note);
  if (hasWriting) note.breaks = [...suggested(key)];
  else notes.set(key, { verseKey: key, breaks: [], phrases: {}, updatedAt: 0, deleted: true });
  persist(key);
}

export function updatePhrase(key: string, start: number, patch: Partial<PhraseData>): void {
  const current = phrasesOf(key).find((p) => p.start === start);
  if (!current) return;
  const note = ensure(key);
  note.phrases[start] = { meaning: current.meaning, note: current.note, ...patch };
  persist(key);
}
