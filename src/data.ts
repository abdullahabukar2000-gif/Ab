import type { Chapter, PageData } from './types';
import chaptersFile from '../data/chapters.json';
import alignFile from '../data/align/clear-quran.json';

// Every ingested page is bundled, so the app works with no network at all.
const files = import.meta.glob<PageData>('../data/pages/*.json', { eager: true, import: 'default' });

const pages = new Map<number, PageData>();
for (const data of Object.values(files)) pages.set(data.page, data);

export const availablePages = [...pages.keys()].sort((a, b) => a - b);

export function getPage(n: number): PageData | undefined {
  return pages.get(n);
}

const chapters = new Map<number, Chapter>((chaptersFile.chapters as Chapter[]).map((c) => [c.id, c]));

export function getChapter(id: number): Chapter | undefined {
  return chapters.get(id);
}

/** The surah a page's running head names: whichever surah its first word belongs to. */
export function surahOfPage(page: PageData): Chapter | undefined {
  const first = page.lines.find((l) => l.words.length)?.words[0];
  return first ? getChapter(Number(first.verseKey.split(':')[0])) : undefined;
}

/** An ayah's words in order (end marker excluded), gathered across every page it appears on. */
export function ayahWords(key: string): string[] {
  const words: string[] = [];
  for (const n of availablePages) {
    for (const l of pages.get(n)!.lines) {
      for (const w of l.words) if (w.verseKey === key && w.type === 'word') words[w.pos - 1] = w.uthmani;
    }
  }
  return words;
}

const translationFiles = import.meta.glob<{ translation: string; verses: Record<string, string> }>(
  '../data/translations/clear-quran/*.json', { eager: true, import: 'default' },
);
const translations = new Map<string, string>();
for (const file of Object.values(translationFiles)) for (const [k, v] of Object.entries(file.verses)) translations.set(k, v);

export const TRANSLATION_NAME = 'The Clear Quran, Dr. Mustafa Khattab';
export const translationOf = (key: string) => translations.get(key);

/** Every word of an ayah with the page it sits on, in order, end marker included. */
export function ayahGlyphs(key: string): { page: number; word: import('./types').Word }[] {
  const out: { page: number; word: import('./types').Word }[] = [];
  for (const n of availablePages) {
    for (const l of pages.get(n)!.lines) for (const w of l.words) if (w.verseKey === key) out.push({ page: n, word: w });
  }
  return out.sort((a, b) => a.word.pos - b.word.pos);
}


interface Alignment { ends: number[]; pieces: [number, number, number][] }
const alignments = (alignFile as unknown as { verses: Record<string, Alignment> }).verses;

/**
 * Meaning groups for an ayah: the index of each group's last word, matched to
 * The Clear Quran by scripts/align-source.py. Undefined if not aligned yet.
 */
export const meaningEnds = (key: string): number[] | undefined => alignments[key]?.ends;

/**
 * The translation cut into pieces, in English order, each tagged with the
 * meaning group it translates. `before` is the text between the previous piece
 * and this one (a space, or nothing), so the pieces rebuild the sentence exactly.
 */
export function translationPieces(key: string): { before: string; text: string; group: number }[] | undefined {
  const a = alignments[key];
  const text = translations.get(key);
  if (!a || !text) return undefined;
  let at = 0;
  return a.pieces.map(([start, end, group]) => {
    const piece = { before: text.slice(at, start), text: text.slice(start, end), group };
    at = end;
    return piece;
  });
}

export const allChapters = (): Chapter[] => [...chapters.values()];

/** Pages that hold any ayah of a surah, and how many of its ayahs have been added. */
const coverage = new Map<number, { pages: number[]; ayahs: Set<string> }>();
for (const n of availablePages) {
  for (const key of pages.get(n)!.verses) {
    const s = Number(key.split(':')[0]);
    const c = coverage.get(s) ?? { pages: [], ayahs: new Set<string>() };
    if (!c.pages.includes(n)) c.pages.push(n);
    c.ayahs.add(key);
    coverage.set(s, c);
  }
}
export function surahCoverage(id: number): { pages: number[]; added: number } {
  const c = coverage.get(id);
  return { pages: c?.pages ?? [], added: c?.ayahs.size ?? 0 };
}

/** The first page an ayah appears on. */
export function pageOfAyah(key: string): number | undefined {
  return availablePages.find((n) => pages.get(n)!.verses.includes(key));
}
