#!/usr/bin/env node
// Saves word-by-word English glosses (the word-by-word translation quran.com
// shows) for every ayah on an ingested page, so tapping a phrase can show
// what its words mean, offline.
//
//   node scripts/wordbyword.js
//
// Source: npm @kmaslesa/holy-quran-word-by-word-full-data@1.0.6, a copy of
// quran.com's per-word data. Each ayah's word count must match ours exactly,
// or the script stops.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const all = JSON.parse(readFileSync(require.resolve('@kmaslesa/holy-quran-word-by-word-full-data/data.json'), 'utf8'));

// Our ayahs and their word counts.
const ours = new Map();
for (const f of readdirSync(join(ROOT, 'data', 'pages'))) {
  for (const l of JSON.parse(readFileSync(join(ROOT, 'data', 'pages', f), 'utf8')).lines) {
    for (const w of l.words) if (w.type === 'word') ours.set(w.verseKey, Math.max(ours.get(w.verseKey) ?? 0, w.pos));
  }
}

const glosses = new Map();
for (const page of all) {
  for (const ayah of page.ayahs ?? []) {
    for (const w of ayah.words ?? []) {
      if (!w || w.char_type_name !== 'word' || !ours.has(w.parentAyahVerseKey)) continue;
      const list = glosses.get(w.parentAyahVerseKey) ?? [];
      list[w.position - 1] = w.translation?.text ?? '';
      glosses.set(w.parentAyahVerseKey, list);
    }
  }
}

const bySurah = {};
for (const [key, count] of ours) {
  const list = glosses.get(key);
  if (!list || list.length !== count || list.some((g) => g == null)) {
    throw new Error(`${key}: ${list?.length ?? 0} glosses, expected ${count} words`);
  }
  const surah = key.split(':')[0];
  (bySurah[surah] ??= {})[key] = list;
}

const out = join(ROOT, 'data', 'wbw');
mkdirSync(out, { recursive: true });
for (const [surah, verses] of Object.entries(bySurah)) {
  writeFileSync(join(out, `${surah}.json`), JSON.stringify({ surah: Number(surah), source: 'quran.com word-by-word English', verses }, null, 1) + '\n');
  console.log(`surah ${surah}: ${Object.keys(verses).length} ayahs`);
}
