#!/usr/bin/env node
// Saves The Clear Quran (Dr. Mustafa Khattab, the translation quran.com shows by
// default, resource 131) for every surah that has an ingested page, so the
// verse-by-verse view works offline.
//
//   node scripts/translations.js
//
// Source: github.com/fawazahmed0/quran-api, edition eng-mustafakhattaba
// ("Allah" edition), pinned. Checked by hand against quran.com for 14:22-23.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/fawazahmed0/quran-api/47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/eng-mustafakhattaba';
const OUT = join(ROOT, 'data', 'translations', 'clear-quran');
const counts = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, 'data', 'chapters.json'), 'utf8')).chapters.map((c) => [c.id, c.verses_count]),
);

const surahs = new Set();
for (const f of readdirSync(join(ROOT, 'data', 'pages'))) {
  for (const key of JSON.parse(readFileSync(join(ROOT, 'data', 'pages', f), 'utf8')).verses) surahs.add(Number(key.split(':')[0]));
}

mkdirSync(OUT, { recursive: true });
for (const s of [...surahs].sort((a, b) => a - b)) {
  const res = await fetch(`${BASE}/${s}.json`);
  if (!res.ok) throw new Error(`surah ${s}: HTTP ${res.status}`);
  const verses = {};
  for (const v of (await res.json()).chapter) {
    if (v.chapter !== s) throw new Error(`surah ${s}: got a verse from surah ${v.chapter}`);
    verses[`${s}:${v.verse}`] = v.text.replace(/ /g, ' ').trim();
  }
  if (Object.keys(verses).length !== counts[s]) throw new Error(`surah ${s}: ${Object.keys(verses).length} verses, expected ${counts[s]}`);
  writeFileSync(join(OUT, `${s}.json`), JSON.stringify({ surah: s, translation: 'The Clear Quran — Dr. Mustafa Khattab', verses }, null, 1) + '\n');
  console.log(`surah ${s}: ${Object.keys(verses).length} verses`);
}
