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
