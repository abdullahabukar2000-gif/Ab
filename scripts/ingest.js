#!/usr/bin/env node
// One-off ingest: pulls the Madani Mushaf (QCF V2, mushaf=1) layout for a page
// or a whole surah and writes data/pages/{n}.json.
//
//   node scripts/ingest.js 258          one page
//   node scripts/ingest.js 255-261      a range of pages
//   node scripts/ingest.js --surah 14   every page a surah touches
//   node scripts/ingest.js 258 --source github
//
// Source: the public quran.com API (no login). If QF_CLIENT_ID and
// QF_AUTH_TOKEN are set in .env, the Quran Foundation API is used instead.
// `--source github` reads the community mushaf-layout dataset on GitHub
// (github.com/zonetecde/mushaf-layout) for when quran.com can't be reached.
// It is not official: re-ingest from quran.com when possible and compare.
//
// Each page's QCF V2 font is downloaded, unmodified, to public/fonts/qcf2/ so
// the app works offline. Two further checks run against King Fahd Complex
// files (via github.com/mustafa0x/qpc-fonts):
//   - the font's internal name must be that page's (QCF2258 for page 258), and
//     it must hold a glyph for every word code on the page with no unused
//     glyph in between, so a page can never be paired with the wrong font;
//   - every ayah's codes must match the Complex's own per-ayah listing.
//
// Every page is fetched twice and the two layouts must match word for word,
// because the API has been seen to return different line breaks for the same
// request. Any disagreement, or a page that isn't exactly 15 lines, stops the
// script with the page number. Nothing is written for a page that fails.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data', 'pages');
const FONT_DIR = join(ROOT, 'public', 'fonts', 'qcf2');
const QPC_FONTS = 'https://raw.githubusercontent.com/mustafa0x/qpc-fonts/8a4f39d563ea69c994416a1692827e38156c548d';

// Glyphs present in every QCF V2 page font that no word on the page uses.
const SHARED_GLYPHS = new Set([0xfb50, ...Array.from({ length: 0xfd79 - 0xfd5a + 1 }, (_, i) => 0xfd5a + i)]);

// The basmalah as drawn by the QCF V2 basmalah font (QCF2BSML).
const BASMALAH_CODE = '\ufb51\ufb52\ufb53';
const LINES_PER_PAGE = 15;
const TOTAL_PAGES = 604;

// Surahs that open without a separate basmalah line: Al-Fatihah (its basmalah
// is ayah 1) and At-Tawbah (no basmalah).
const NO_BASMALAH_LINE = new Set([1, 9]);

// Lines set centred rather than justified, beyond surah headings and basmalah
// (which are always centred). Explicit on purpose: never inferred from width.
// Format: { [page]: [lineNumber, ...] }
const CENTERED_LINES = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

// ---------------------------------------------------------------- config

function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function apiConfig() {
  const { QF_CLIENT_ID, QF_AUTH_TOKEN, QURAN_API_BASE } = process.env;
  if (QURAN_API_BASE) return { base: QURAN_API_BASE, headers: {}, label: QURAN_API_BASE };
  if (QF_CLIENT_ID && QF_AUTH_TOKEN) {
    return {
      base: 'https://apis.quran.foundation/content/api/v4',
      headers: { 'x-client-id': QF_CLIENT_ID, 'x-auth-token': QF_AUTH_TOKEN },
      label: 'Quran Foundation API',
    };
  }
  return { base: 'https://api.quran.com/api/v4', headers: {}, label: 'quran.com public API' };
}

// ---------------------------------------------------------------- fetching

async function getJson(api, path) {
  const url = `${api.base}${path}`;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', ...api.headers } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchPageWords(api, page) {
  const words = [];
  for (let p = 1; ; p++) {
    const query = new URLSearchParams({
      mushaf: '1',
      words: 'true',
      word_fields: 'code_v2,line_number,page_number,text_uthmani',
      per_page: '50',
      page: String(p),
    });
    const body = await getJson(api, `/verses/by_page/${page}?${query}`);
    for (const verse of body.verses ?? []) {
      for (const w of verse.words ?? []) {
        // A verse that crosses a page break comes back whole; keep only this page's words.
        if (w.page_number !== page) continue;
        words.push({
          code: w.code_v2,
          uthmani: w.text_uthmani,
          verseKey: verse.verse_key,
          pos: w.position,
          type: w.char_type_name,
          line: w.line_number,
        });
      }
    }
    const next = body.pagination?.next_page;
    if (!next) break;
  }
  return words;
}

const GITHUB_BASE = 'https://raw.githubusercontent.com/zonetecde/mushaf-layout/72116ce4d405d67823804f0eed795c1e6409b4af/mushaf';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[d]);

// The GitHub dataset glues each ayah's end marker onto its last word
// ("word ١٩" / "glyph glyph"). Split it back out so words match the API's shape.
async function fetchPageWordsGithub(page) {
  const res = await fetch(`${GITHUB_BASE}/page-${String(page).padStart(3, '0')}.json`);
  if (!res.ok) fail(`page ${page}: GitHub dataset returned HTTP ${res.status}`);
  const body = await res.json();
  if (body.page !== page) fail(`page ${page}: GitHub file says it is page ${body.page}`);
  const words = [];
  const labels = {};
  for (const l of body.lines ?? []) {
    if (l.type === 'surah-header') { labels[l.line] = { type: 'surah_name', surah: Number(l.surah), name: l.text }; continue; }
    if (l.type === 'basmala') {
      if (l.qpcV2 !== BASMALAH_CODE) fail(`page ${page}: unexpected basmalah glyphs on line ${l.line}`);
      labels[l.line] = { type: 'basmalah' };
      continue;
    }
    if (l.type !== 'text') fail(`page ${page}: line ${l.line} has unknown type ${l.type}`);
    for (const w of l.words ?? []) {
      const [surah, ayah, pos] = w.location.split(':').map(Number);
      const verseKey = `${surah}:${ayah}`;
      const glyphs = w.qpcV2.split(' ');
      if (glyphs.length === 1) {
        words.push({ code: w.qpcV2, uthmani: w.word, verseKey, pos, type: 'word', line: l.line });
        continue;
      }
      const tokens = w.word.split(' ');
      const number = tokens.pop();
      if (glyphs.length !== 2 || number !== toArabicDigits(ayah)) {
        fail(`page ${page}: can't split end marker from ${w.location} ("${w.word}" / ${glyphs.length} glyphs)`);
      }
      words.push({ code: glyphs[0], uthmani: tokens.join(' '), verseKey, pos, type: 'word', line: l.line });
      words.push({ code: glyphs[1], uthmani: number, verseKey, pos: pos + 1, type: 'end', line: l.line });
    }
  }
  return { words, labels };
}

async function pagesForSurah(api, surah) {
  const body = await getJson(api, `/pages/lookup?chapter_number=${surah}&mushaf=1`);
  const pages = Object.keys(body.pages ?? {}).map(Number).filter(Boolean);
  if (!pages.length) fail(`surah ${surah}: /pages/lookup returned no pages`);
  return pages.sort((a, b) => a - b);
}

// ---------------------------------------------------------------- layout

function fail(message) {
  const err = new Error(message);
  err.ingest = true;
  throw err;
}

function verseParts(key) {
  const [s, a] = key.split(':').map(Number);
  return { surah: s, ayah: a };
}

function buildLayout(page, words, verseCounts, labels = null, surahNames = null) {
  if (!words.length) fail(`page ${page}: API returned no words`);

  const byLine = new Map();
  for (const w of words) {
    if (!Number.isInteger(w.line) || w.line < 1 || w.line > LINES_PER_PAGE) {
      fail(`page ${page}: word ${w.verseKey}#${w.pos} has line_number ${w.line}`);
    }
    if (!w.code) fail(`page ${page}: word ${w.verseKey}#${w.pos} has no code_v2 glyph`);
    if (!byLine.has(w.line)) byLine.set(w.line, []);
    byLine.get(w.line).push(w);
  }

  // Lines with no words are surah headings / basmalah. Work out which is which
  // from the ayah-1 that follows them; anything else is an unexplained gap.
  const centred = new Set(CENTERED_LINES[page] ?? []);
  const lines = [];
  for (let n = 1; n <= LINES_PER_PAGE; n++) {
    const lineWords = byLine.get(n);
    if (lineWords) {
      lines.push({
        line: n,
        type: 'text',
        centered: centred.has(n),
        words: lineWords.map(({ code, uthmani, verseKey, pos, type }) => ({ code, uthmani, verseKey, pos, type })),
      });
      continue;
    }
    lines.push({ line: n, type: null, centered: true, words: [] });
  }

  // Fill in the gaps, walking each run of empty lines against the surah that opens after it.
  for (let i = 0; i < lines.length; ) {
    if (lines[i].type !== null) { i++; continue; }
    let j = i;
    while (j < lines.length && lines[j].type === null) j++;
    const gap = j - i;
    const after = lines[j]?.words[0];
    const opens = after && verseParts(after.verseKey).ayah === 1 && after.pos === 1 ? verseParts(after.verseKey).surah : null;
    // Empty lines at the foot of a page are the next surah's heading, but only
    // if the page really ends on the last ayah of its surah.
    const last = words[words.length - 1];
    const lastV = verseParts(last.verseKey);
    const endsSurah = last.type === 'end' && (verseCounts
      ? lastV.ayah === verseCounts[lastV.surah]
      : labels?.[i + 1]?.surah === lastV.surah + 1);
    const nextSurahGuess = opens ?? (!after && endsSurah ? lastV.surah + 1 : null);
    const expected = nextSurahGuess && !NO_BASMALAH_LINE.has(nextSurahGuess) ? ['surah_name', 'basmalah'] : ['surah_name'];
    if (!nextSurahGuess) {
      fail(`page ${page}: lines ${i + 1}-${j} are empty and no surah opens after them`);
    }
    // At the foot of a page the heading can appear alone (basmalah on the next page) or with its basmalah.
    if (gap !== expected.length && !(after === undefined && gap <= expected.length)) {
      fail(`page ${page}: lines ${i + 1}-${j} (${gap} empty) before surah ${nextSurahGuess}; expected ${expected.length}`);
    }
    for (let k = 0; k < gap; k++) {
      const l = lines[i + k];
      l.type = expected[k];
      l.surah = nextSurahGuess;
      if (l.type === 'surah_name') l.name = surahNames?.[nextSurahGuess] ?? labels?.[l.line]?.name ?? null;
      if (l.type === 'basmalah') l.code = BASMALAH_CODE;
    }
    i = j;
  }

  // A source that labels its own heading lines must agree with what we worked out.
  for (const [n, label] of Object.entries(labels ?? {})) {
    const l = lines[Number(n) - 1];
    if (l.type !== label.type || (label.surah && l.surah !== label.surah)) {
      fail(`page ${page}: line ${n} is labelled ${label.type} by the source but looks like ${l.type}`);
    }
  }

  // Sanity: glyph codes on a page run in one unbroken sequence.
  const codes = words.flatMap((w) => [...w.code].map((c) => c.codePointAt(0)));
  for (let k = 1; k < codes.length; k++) {
    if (codes[k] !== codes[k - 1] + 1) fail(`page ${page}: glyph codes jump from U+${codes[k - 1].toString(16)} to U+${codes[k].toString(16)}`);
  }

  // Sanity: words must run in reading order across the whole page.
  const order = words.map((w) => `${w.verseKey}#${w.pos}`);
  const flat = lines.flatMap((l) => l.words.map((w) => `${w.verseKey}#${w.pos}`));
  if (order.join() !== flat.join()) fail(`page ${page}: words are out of reading order after grouping by line`);
  for (let k = 1; k < words.length; k++) {
    const a = verseParts(words[k - 1].verseKey), b = verseParts(words[k].verseKey);
    const same = a.surah === b.surah && a.ayah === b.ayah;
    const forward = same ? words[k].pos > words[k - 1].pos : (b.surah > a.surah || (b.surah === a.surah && b.ayah > a.ayah));
    if (!forward) fail(`page ${page}: ${words[k - 1].verseKey}#${words[k - 1].pos} is followed by ${words[k].verseKey}#${words[k].pos}`);
    if (words[k].line < words[k - 1].line) fail(`page ${page}: line numbers go backwards at ${words[k].verseKey}#${words[k].pos}`);
  }

  if (lines.length !== LINES_PER_PAGE) fail(`page ${page}: built ${lines.length} lines, expected ${LINES_PER_PAGE}`);

  const verses = [...new Set(words.map((w) => w.verseKey))];
  return { page, mushaf: 'qcf_v2', lines, verses };
}

function fingerprint(words) {
  return words.map((w) => `${w.verseKey}#${w.pos}@${w.line}:${w.code}`).join('|');
}

// ---------------------------------------------------------------- output

function printPage(layout) {
  console.log(`\n── page ${layout.page} · ${layout.verses[0]} to ${layout.verses[layout.verses.length - 1]} ──`);
  for (const l of layout.lines) {
    const num = String(l.line).padStart(2, ' ');
    let text;
    if (l.type === 'surah_name') text = `[surah ${l.surah} heading]`;
    else if (l.type === 'basmalah') text = '[basmalah]';
    else text = l.words.map((w) => w.uthmani).join(' ');
    console.log(`${num}${l.centered ? ' (c)' : '    '}  ${text}`);
  }
}

async function fetchChapters(api) {
  const body = await getJson(api, '/chapters');
  const counts = {}, names = {};
  for (const c of body.chapters ?? []) { counts[c.id] = c.verses_count; names[c.id] = c.name_arabic; }
  if (Object.keys(counts).length !== 114) fail(`/chapters returned ${Object.keys(counts).length} surahs, expected 114`);
  return { counts, names };
}

// ---------------------------------------------------------------- KFGQPC checks

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

let ayahListing;
async function kfgqpcAyahs(page) {
  if (!ayahListing) {
    ayahListing = new Map();
    const text = (await download(`${QPC_FONTS}/mushaf-v2.txt`)).toString('utf8');
    for (const row of text.split('\n')) {
      if (!row.trim()) continue;
      const comma = row.indexOf(',');
      const p = Number(row.slice(0, comma));
      if (!ayahListing.has(p)) ayahListing.set(p, []);
      ayahListing.get(p).push(row.slice(comma + 1).replace(/ /g, ''));
    }
  }
  return ayahListing.get(page) ?? [];
}

async function checkAgainstKfgqpc(layout) {
  const { page } = layout;
  const byAyah = new Map();
  for (const l of layout.lines) for (const w of l.words) byAyah.set(w.verseKey, (byAyah.get(w.verseKey) ?? '') + w.code);
  const ours = [...byAyah.entries()];
  const theirs = await kfgqpcAyahs(page);
  if (ours.length !== theirs.length) fail(`page ${page}: ${ours.length} ayahs here, King Fahd listing has ${theirs.length}`);
  ours.forEach(([key, codes], i) => {
    if (codes !== theirs[i]) fail(`page ${page}: ayah ${key} glyphs differ from the King Fahd listing`);
  });
}

async function ensureFont(file, url) {
  const path = join(FONT_DIR, file);
  if (existsSync(path)) return readFileSync(path);
  const buf = await download(url);
  mkdirSync(FONT_DIR, { recursive: true });
  writeFileSync(path, buf);
  return buf;
}

async function checkPageFont(layout) {
  const { page } = layout;
  const name = `QCF2${String(page).padStart(3, '0')}`;
  const buf = await ensureFont(`p${page}.ttf`, `${QPC_FONTS}/mushaf-v2/${name}.ttf`);
  const font = fontkit.create(buf);
  if (font.postscriptName !== name && font.fullName !== name) fail(`page ${page}: font file is ${font.fullName}, expected ${name}`);
  // 0xFFFF is the cmap table's end marker, not a glyph.
  const inFont = new Set(font.characterSet.filter((c) => c > 0x20 && c !== 0xffff));
  const used = new Set(layout.lines.flatMap((l) => l.words.flatMap((w) => [...w.code].map((c) => c.codePointAt(0)))));
  for (const c of used) if (!inFont.has(c)) fail(`page ${page}: font ${name} has no glyph for U+${c.toString(16)}`);
  // Some fonts carry unused glyphs after the page's last word (page 256 has 15);
  // harmless. An unused glyph *among* the page's words means a word is missing.
  const last = Math.max(...used);
  for (const c of inFont) {
    if (c < last && !used.has(c) && !SHARED_GLYPHS.has(c)) fail(`page ${page}: font ${name} has glyph U+${c.toString(16)} that no word on the page uses`);
  }
}

async function checkBasmalahFont() {
  const buf = await ensureFont('bsml.ttf', `${QPC_FONTS}/mushaf-v2/QCF2BSML.ttf`);
  const font = fontkit.create(buf);
  for (const ch of BASMALAH_CODE) {
    if (!font.characterSet.includes(ch.codePointAt(0))) fail(`basmalah font has no glyph for U+${ch.codePointAt(0).toString(16)}`);
  }
}

async function ingestPage(api, page, chapters) {
  const fetchOnce = api.github ? () => fetchPageWordsGithub(page) : async () => ({ words: await fetchPageWords(api, page), labels: null });
  const first = await fetchOnce();
  const second = await fetchOnce();
  if (fingerprint(first.words) !== fingerprint(second.words)) {
    fail(`page ${page}: two identical requests returned different layouts; not writing anything`);
  }
  const layout = { ...buildLayout(page, first.words, chapters?.counts, first.labels, chapters?.names), source: api.label };
  await checkAgainstKfgqpc(layout);
  await checkPageFont(layout);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${page}.json`), JSON.stringify(layout, null, 2) + '\n');
  return layout;
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const at = argv.indexOf('--source');
  const source = at === -1 ? 'api' : argv[at + 1];
  if (at !== -1) argv = argv.filter((_, i) => i !== at && i !== at + 1);
  if (source !== 'api' && source !== 'github') fail('--source must be api or github');
  return { ...parseTarget(argv), source };
}

function parseTarget(argv) {
  if (argv[0] === '--surah') {
    const s = Number(argv[1]);
    if (!Number.isInteger(s) || s < 1 || s > 114) fail('usage: --surah <1-114>');
    return { surah: s };
  }
  const m = /^(\d+)(?:-(\d+))?$/.exec(argv[0] ?? '');
  if (!m) fail('usage: node scripts/ingest.js <page> | <from>-<to> | --surah <n>');
  const from = Number(m[1]), to = Number(m[2] ?? m[1]);
  if (from < 1 || to > TOTAL_PAGES || from > to) fail(`pages must be within 1-${TOTAL_PAGES}`);
  return { pages: Array.from({ length: to - from + 1 }, (_, i) => from + i) };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const api = args.source === 'github'
    ? { github: true, label: 'github.com/zonetecde/mushaf-layout (community copy, not official)' }
    : apiConfig();
  if (api.github && !args.pages) fail('--source github needs page numbers, not --surah');
  const pages = args.pages ?? (await pagesForSurah(api, args.surah));
  console.log(`source: ${api.label}`);
  const chapters = api.github ? null : await fetchChapters(api);
  await checkBasmalahFont();

  let failed = 0;
  for (const page of pages) {
    try {
      printPage(await ingestPage(api, page, chapters));
      console.log(`   → data/pages/${page}.json + public/fonts/qcf2/p${page}.ttf`);
    } catch (err) {
      failed++;
      console.error(`\n✗ ${err.ingest ? err.message : `page ${page}: ${err.message}`}`);
    }
  }
  if (failed) {
    console.error(`\n${failed} of ${pages.length} page(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
