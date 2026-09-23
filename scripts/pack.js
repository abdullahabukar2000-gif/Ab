#!/usr/bin/env node
// Packs the verified page data for the app, which loads it as needed instead
// of all at once:
//   public/data/index.json          per page: surahs, first/last ayah, glyphs ok
//   public/data/pages-NN.json       20 pages per file (31 files)
//   public/data/clear-quran.json    the translation, every ayah
// Run after ingest: `node scripts/pack.js`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const PER_FILE = 20;
mkdirSync(OUT, { recursive: true });

const index = {};
const chunks = {};
for (let p = 1; p <= 604; p++) {
  const page = JSON.parse(readFileSync(join(ROOT, 'data', 'pages', `${p}.json`), 'utf8'));
  const slim = { page: p, lines: page.lines, verses: page.verses };
  if (page.glyphs === false) { slim.glyphs = false; slim.problem = page.problem; }
  (chunks[Math.floor((p - 1) / PER_FILE)] ??= {})[p] = slim;
  const surahs = [...new Set(page.verses.map((k) => Number(k.split(':')[0])))];
  const opens = page.lines.filter((l) => l.type === 'surah_name').map((l) => l.surah);
  index[p] = { s: surahs, v: [page.verses[0], page.verses[page.verses.length - 1]], o: opens, ...(page.glyphs === false ? { t: 1 } : {}) };
}
for (const [c, pages] of Object.entries(chunks)) {
  writeFileSync(join(OUT, `pages-${String(c).padStart(2, '0')}.json`), JSON.stringify(pages));
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ perFile: PER_FILE, pages: index }));

const verses = {};
for (const f of readdirSync(join(ROOT, 'data', 'translations', 'clear-quran'))) {
  Object.assign(verses, JSON.parse(readFileSync(join(ROOT, 'data', 'translations', 'clear-quran', f), 'utf8')).verses);
}
writeFileSync(join(OUT, 'clear-quran.json'), JSON.stringify(verses));
console.log(`${Object.keys(chunks).length} page files, index of ${Object.keys(index).length} pages, ${Object.keys(verses).length} translated ayahs`);
