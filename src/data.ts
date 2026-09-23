import type { Chapter, PageData } from './types';
import chaptersFile from '../data/chapters.json';

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

const wbwFiles = import.meta.glob<{ verses: Record<string, string[]> }>('../data/wbw/*.json', { eager: true, import: 'default' });
const wbw = new Map<string, string[]>();
for (const file of Object.values(wbwFiles)) for (const [k, v] of Object.entries(file.verses)) wbw.set(k, v);

/**
 * Word-by-word English for words `start`..`end` of an ayah, joined. quran.com
 * repeats a gloss across the words it spans ("Allah sets forth" twice), so a
 * repeat is shown once.
 */
export function phraseGloss(key: string, start: number, end: number): string | undefined {
  const list = wbw.get(key);
  if (!list) return undefined;
  const parts = list.slice(start, end + 1).filter((g, i, arr) => g && g !== arr[i - 1]);
  return parts.join(' ');
}
