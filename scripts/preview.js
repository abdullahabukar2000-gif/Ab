#!/usr/bin/env node
// Turns the single-file build (dist/index.html) into a page that can be shared
// as a link: just the body content, styles and script, no <html>/<head> shell.
// The QCF fonts stay as separate files next to it (dist/fonts/qcf2/).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');
const title = pick(/<title>[\s\S]*?<\/title>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

writeFileSync('dist/preview.html', ['<meta charset="utf-8">', title, styles, body.trim(), scripts].join('\n'));
console.log(`dist/preview.html (${(Buffer.byteLength(readFileSync('dist/preview.html')) / 1024).toFixed(0)} KB)`);
