#!/usr/bin/env node
// Copies onnxruntime-web's WASM engine (used by recitation mode) into
// public/ort/, so the website serves it itself and it works offline.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}
console.log('onnxruntime-web engine copied to public/ort/');
