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

import { ayahWords, meaningEnds } from './data';
import { suggestBreaks } from './suggest';

export interface PhraseData { meaning: string; note: string }

export interface Note {
  verseKey: string;
  breaks: number[];
  phrases: Record<string, PhraseData>;
}

export interface Phrase extends PhraseData { start: number; end: number; index: number }

const notes = new Map<string, Note>();

// Until notes are saved to the account (Phase 4), edits are kept in this browser.
const STORAGE_KEY = 'mushaf-notes-v2';
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Note>;
  for (const n of Object.values(saved)) notes.set(n.verseKey, n);
} catch { /* unavailable or unreadable: start from suggestions */ }

function persist(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(notes)));
  } catch { /* private mode: edits last for this visit */ }
  listeners.forEach((fn) => fn(key));
}

const listeners = new Set<(verseKey: string) => void>();
export function onChange(fn: (verseKey: string) => void): void { listeners.add(fn); }

const suggestions = new Map<string, number[]>();
export function suggested(key: string): number[] {
  let s = suggestions.get(key);
  // Meaning groups matched to the translation where they exist; otherwise the
  // pause-sign and phrase-length guess.
  if (!s) { s = meaningEnds(key)?.slice(0, -1) ?? suggestBreaks(ayahWords(key)); suggestions.set(key, s); }
  return s;
}

export const wordCount = (key: string) => ayahWords(key).length;

/** True while the ayah is still grouped as suggested (whether or not anything is written). */
export function usesSuggestion(key: string): boolean {
  const note = notes.get(key);
  return !note || note.breaks.join() === suggested(key).join();
}

export function phrasesOf(key: string): Phrase[] {
  const count = wordCount(key);
  const note = notes.get(key);
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
  let note = notes.get(key);
  if (!note) { note = { verseKey: key, breaks: [...suggested(key)], phrases: {} }; notes.set(key, note); }
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
  const note = notes.get(key);
  if (!note) return;
  const hasWriting = Object.values(note.phrases).some((p) => p.meaning || p.note);
  if (hasWriting) note.breaks = [...suggested(key)];
  else notes.delete(key);
  persist(key);
}

export function updatePhrase(key: string, start: number, patch: Partial<PhraseData>): void {
  const current = phrasesOf(key).find((p) => p.start === start);
  if (!current) return;
  const note = ensure(key);
  note.phrases[start] = { meaning: current.meaning, note: current.note, ...patch };
  persist(key);
}
