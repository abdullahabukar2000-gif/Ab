// The memoriser's own layer: where each ayah breaks into phrases, and each
// phrase's tone, meaning and note. Kept apart from the page data so
// re-ingesting a page never touches it.
//
// `breaks` are word indices (0-based, end markers excluded) that END a
// phrase. Phrase data is keyed by the phrase's first word index. Healing a
// break leaves the merged phrase's data in place, unused, so cutting the same
// spot again brings it back.

import { availablePages, getPage } from './data';

export const TONES = ['ink', 'leaf', 'clay', 'plum', 'sea', 'stone'] as const;
export type Tone = (typeof TONES)[number];

export interface PhraseData { tone: Tone; meaning: string; note: string }

export interface Note {
  verseKey: string;
  example?: boolean;
  breaks: number[];
  phrases: Record<string, PhraseData>;
}

export interface Phrase extends PhraseData { start: number; end: number; index: number }

const seeded = import.meta.glob<Note>('../data/notes/*.json', { eager: true, import: 'default' });
const notes = new Map<string, Note>();
for (const n of Object.values(seeded)) notes.set(n.verseKey, structuredClone(n));

// Until Phase 4 saves to disk, edits are kept in this browser.
const STORAGE_KEY = 'mushaf-notes-v1';
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Note>;
  for (const n of Object.values(saved)) notes.set(n.verseKey, n);
} catch { /* unavailable or unreadable: start from the bundled notes */ }

const edited = new Set<string>();
function persist(key: string): void {
  edited.add(key);
  try {
    const out: Record<string, Note> = {};
    for (const k of edited) { const n = notes.get(k); if (n) out[k] = n; }
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...out }));
  } catch { /* private mode: edits last for this visit */ }
  listeners.forEach((fn) => fn(key));
}

const listeners = new Set<(verseKey: string) => void>();
export function onChange(fn: (verseKey: string) => void): void { listeners.add(fn); }

/** Word count of an ayah, gathered across every page it appears on. */
const wordCounts = new Map<string, number>();
for (const p of availablePages) {
  for (const l of getPage(p)!.lines) {
    for (const w of l.words) {
      if (w.type === 'word') wordCounts.set(w.verseKey, Math.max(wordCounts.get(w.verseKey) ?? 0, w.pos));
    }
  }
}
export const wordCount = (key: string) => wordCounts.get(key) ?? 0;

export function getNote(key: string): Note | undefined { return notes.get(key); }

/** An ayah counts as touched once it has at least one break. */
export function isCut(key: string): boolean { return (notes.get(key)?.breaks.length ?? 0) > 0; }

export function phrasesOf(key: string): Phrase[] {
  const count = wordCount(key);
  const note = notes.get(key);
  const ends = [...new Set((note?.breaks ?? []).filter((b) => b >= 0 && b < count - 1))].sort((a, b) => a - b);
  ends.push(count - 1);
  let start = 0;
  return ends.map((end, index) => {
    const data = note?.phrases[start] ?? { tone: TONES[index % TONES.length], meaning: '', note: '' };
    const phrase = { ...data, start, end, index };
    start = end + 1;
    return phrase;
  });
}

export function phraseAt(key: string, wordIndex: number): Phrase | undefined {
  return phrasesOf(key).find((p) => wordIndex >= p.start && wordIndex <= p.end);
}

function ensure(key: string): Note {
  let note = notes.get(key);
  if (!note) { note = { verseKey: key, breaks: [], phrases: {} }; notes.set(key, note); }
  delete note.example; // once edited, it's the memoriser's own
  return note;
}

/** Cut after word `index`, or heal the cut if there is one. */
export function toggleBreak(key: string, index: number): void {
  if (index < 0 || index >= wordCount(key) - 1) return;
  const note = ensure(key);
  // Freeze the current phrases' look so new neighbours don't reshuffle tones.
  for (const p of phrasesOf(key)) note.phrases[p.start] ??= { tone: p.tone, meaning: p.meaning, note: p.note };
  const at = note.breaks.indexOf(index);
  if (at === -1) note.breaks.push(index); else note.breaks.splice(at, 1);
  note.breaks.sort((a, b) => a - b);
  const next = phrasesOf(key).find((p) => p.start === index + 1);
  if (at === -1 && next && !note.phrases[next.start]) {
    const prev = phraseAt(key, index)!;
    note.phrases[next.start] = { tone: TONES[(TONES.indexOf(prev.tone) + 1) % TONES.length], meaning: '', note: '' };
  }
  persist(key);
}

export function updatePhrase(key: string, start: number, patch: Partial<PhraseData>): void {
  const note = ensure(key);
  const current = phrasesOf(key).find((p) => p.start === start);
  if (!current) return;
  note.phrases[start] = { tone: current.tone, meaning: current.meaning, note: current.note, ...patch };
  persist(key);
}
