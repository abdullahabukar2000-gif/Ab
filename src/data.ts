import type { Chapter, PageData, Word } from './types';
import chaptersFile from '../data/chapters.json';
import alignFile from '../data/align/clear-quran.json';

// All 604 pages, loaded as they're needed rather than all at once. A small
// index (which surahs and ayahs are on each page) comes first; page contents
// arrive in files of 20 pages (see scripts/pack.js); the translation is one
// file, fetched the first time verse by verse opens. Every file ships with
// the app, so once opened it all works offline.

interface PageSummary { s: number[]; v: [string, string]; o: number[]; t?: 1 }
let perFile = 20;
let summaries: Record<string, PageSummary> = {};

export const TOTAL_PAGES = 604;
export const availablePages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

const pages = new Map<number, PageData>();
const chunkJobs = new Map<number, Promise<void>>();

/** Load the page index. The app awaits this once before showing anything. */
export async function loadIndex(): Promise<void> {
  const res = await fetch('data/index.json');
  const body = await res.json() as { perFile: number; pages: Record<string, PageSummary> };
  perFile = body.perFile;
  summaries = body.pages;
}

/** Make sure these pages' contents are loaded. */
export function loadPages(nums: number[]): Promise<void> {
  const chunks = [...new Set(nums.filter((n) => n >= 1 && n <= TOTAL_PAGES).map((n) => Math.floor((n - 1) / perFile)))];
  return Promise.all(chunks.map((c) => {
    let job = chunkJobs.get(c);
    if (!job) {
      job = fetch(`data/pages-${String(c).padStart(2, '0')}.json`)
        .then((r) => { if (!r.ok) throw new Error(`pages ${c}: HTTP ${r.status}`); return r.json(); })
        .then((body: Record<string, PageData>) => { for (const p of Object.values(body)) pages.set(p.page, p); })
        .catch((e) => { chunkJobs.delete(c); throw e; });
      chunkJobs.set(c, job);
    }
    return job;
  })).then(() => undefined);
}

/** A page's contents, if loaded. */
export function getPage(n: number): PageData | undefined {
  return pages.get(n);
}

/** The surahs on a page, in order (from the index; always available). */
export const surahsOnPage = (n: number): number[] => summaries[n]?.s ?? [];
/** The first and last ayah on a page. */
export const ayahRange = (n: number): [string, string] | undefined => summaries[n]?.v;
/** False for the few pages shown only as typed text (their glyphs couldn't be verified). */
export const glyphsVerified = (n: number): boolean => !summaries[n]?.t;

const chapters = new Map<number, Chapter>((chaptersFile.chapters as Chapter[]).map((c) => [c.id, c]));
export function getChapter(id: number): Chapter | undefined { return chapters.get(id); }
export const allChapters = (): Chapter[] => [...chapters.values()];

/**
 * The page a surah starts on: the page with its first ayah. (A few surah
 * titles sit at the foot of the page before, under the end of the previous
 * surah; opening there would show the wrong surah.)
 */
export function surahStartPage(id: number): number {
  return pagesOfAyah(`${id}:1`)[0] ?? availablePages.find((n) => summaries[n]?.s.includes(id)) ?? 1;
}

/** The surah a page's running head names: whichever surah its first word belongs to. */
export function surahOfPage(page: PageData): Chapter | undefined {
  const first = page.lines.find((l) => l.words.length)?.words[0];
  return first ? getChapter(Number(first.verseKey.split(':')[0])) : undefined;
}

const ayahOrder = (key: string) => { const [s, a] = key.split(':').map(Number); return s * 1000 + a; };

/** The pages an ayah appears on (one, or two when it runs over a page turn). */
export function pagesOfAyah(key: string): number[] {
  const k = ayahOrder(key);
  return availablePages.filter((n) => {
    const r = summaries[n]?.v;
    return r && ayahOrder(r[0]) <= k && k <= ayahOrder(r[1]);
  });
}

/** Every word of an ayah with the page it sits on, in order, end marker included. Its pages must be loaded. */
export function ayahGlyphs(key: string): { page: number; word: Word }[] {
  const out: { page: number; word: Word }[] = [];
  for (const n of pagesOfAyah(key)) {
    for (const l of pages.get(n)?.lines ?? []) for (const w of l.words) if (w.verseKey === key) out.push({ page: n, word: w });
  }
  return out.sort((a, b) => a.word.pos - b.word.pos);
}

/** An ayah's words in order (end marker excluded). Its pages must be loaded. */
export function ayahWords(key: string): string[] {
  return ayahGlyphs(key).filter((g) => g.word.type === 'word').map((g) => g.word.uthmani);
}

// ---------------------------------------------------------------- translation

const translations = new Map<string, string>();
let translationJob: Promise<void> | null = null;
export function loadTranslations(): Promise<void> {
  translationJob ??= fetch('data/clear-quran.json')
    .then((r) => r.json())
    .then((verses: Record<string, string>) => { for (const [k, v] of Object.entries(verses)) translations.set(k, v); })
    .catch((e) => { translationJob = null; throw e; });
  return translationJob;
}

export const TRANSLATION_NAME = 'The Clear Quran, Dr. Mustafa Khattab';
export const translationOf = (key: string) => translations.get(key);

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
