#!/usr/bin/env node
// Downloads the page fonts the app uses (the King Fahd Complex QCF V2 fonts,
// unmodified) into public/fonts/qcf2/, from the same pinned source as
// scripts/ingest.js, and checks each file against data/font-hashes.json.
// Used by the website build so the 200 MB of fonts needn't live in git.
// Files already present with the right hash are skipped.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const QPC_FONTS = 'https://raw.githubusercontent.com/mustafa0x/qpc-fonts/8a4f39d563ea69c994416a1692827e38156c548d';
const hashes = JSON.parse(readFileSync('data/font-hashes.json', 'utf8'));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const source = (name) => `${QPC_FONTS}/mushaf-v2/${name === 'bsml' ? 'QCF2BSML' : `QCF2${name.slice(1).padStart(3, '0')}`}.ttf`;

mkdirSync('public/fonts/qcf2', { recursive: true });
const names = Object.keys(hashes);
let fetched = 0;
const bad = [];
async function one(name) {
  const path = `public/fonts/qcf2/${name}.ttf`;
  if (existsSync(path) && sha(readFileSync(path)) === hashes[name]) return;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(source(name));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha(buf) !== hashes[name]) { bad.push(name); return; }
      writeFileSync(path, buf);
      fetched++;
      return;
    } catch (e) {
      if (attempt >= 4) { bad.push(`${name} (${e.message})`); return; }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
for (let i = 0; i < names.length; i += 16) await Promise.all(names.slice(i, i + 16).map(one));
if (bad.length) { console.error(`fonts that failed or didn't match: ${bad.join(', ')}`); process.exit(1); }
console.log(`fonts ok: ${names.length} checked, ${fetched} downloaded`);
