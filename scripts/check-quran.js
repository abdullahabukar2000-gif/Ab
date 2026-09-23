#!/usr/bin/env node
// Whole-mushaf check over data/pages: all 604 pages present; every ayah of all
// 114 surahs appears, each word exactly once and in order, and pages follow
// one another without gaps or overlaps. Prints a summary; exits 1 on a problem.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const chapters = JSON.parse(readFileSync(join(ROOT, 'data', 'chapters.json'), 'utf8')).chapters;
const problems = [];
const seq = [];
let typed = [];
for (let p = 1; p <= 604; p++) {
  const file = join(ROOT, 'data', 'pages', `${p}.json`);
  if (!existsSync(file)) { problems.push(`page ${p} is missing`); continue; }
  const page = JSON.parse(readFileSync(file, 'utf8'));
  if (page.glyphs === false) typed.push(p);
  for (const l of page.lines) for (const w of l.words) seq.push({ p, key: w.verseKey, pos: w.pos, type: w.type });
}

// Walk the whole Quran in order.
let i = 0;
for (const c of chapters) {
  for (let a = 1; a <= c.verses_count; a++) {
    const key = `${c.id}:${a}`;
    let pos = 1;
    let sawEnd = false;
    while (i < seq.length && seq[i].key === key) {
      const w = seq[i];
      if (w.pos !== pos) { problems.push(`${key}: word ${w.pos} where ${pos} was expected (page ${w.p})`); break; }
      if (w.type === 'end') sawEnd = true;
      pos++; i++;
    }
    if (pos === 1) problems.push(`${key} is missing`);
    else if (!sawEnd) problems.push(`${key} has no ayah marker`);
    if (problems.length > 20) break;
  }
  if (problems.length > 20) break;
}
if (i < seq.length && problems.length <= 20) problems.push(`unexpected ${seq[i].key}#${seq[i].pos} on page ${seq[i].p}`);

const ayahs = chapters.reduce((n, c) => n + c.verses_count, 0);
console.log(`${ayahs} ayahs, ${seq.length} words and markers on 604 pages`);
console.log(`typed text only (glyphs not verifiable): ${typed.length ? typed.join(', ') : 'none'}`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('ok: every ayah present once, every word in order');
