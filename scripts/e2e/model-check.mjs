// Runs the recitation model straight on a recording (no browser, no microphone),
// in the same 7-second windows the app uses, to show how well it hears on its own.
// Usage: node scripts/e2e/model-check.mjs rec.wav model.onnx vocab.json
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-node';
import { TextCTCDecoder, overlapMerge } from '@tilawi/quran-asr';
const [wav, model, vocab] = process.argv.slice(2);
const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', wav, '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const session = await ort.InferenceSession.create(model);
const decoder = new TextCTCDecoder(JSON.parse(readFileSync(vocab, 'utf8')), 1024);
async function hear(p) {
  const out = await session.run({ audio_signal: new ort.Tensor('float32', p, [1, p.length]), length: new ort.Tensor('int64', BigInt64Array.from([BigInt(p.length)]), [1]) });
  const t = out[session.outputNames[0]];
  const [, steps, v] = t.dims;
  return decoder.decode(t.data, steps, v).text.split(/\s+/).filter(Boolean);
}
console.log('outputs:', session.outputNames, 'seconds:', (pcm.length / 16000).toFixed(1));
console.log('WHOLE FILE:', (await hear(pcm)).join(' '));
let words = [];
for (let s = 0; s < pcm.length; s += 16000 * 5.5) words = overlapMerge(words, await hear(pcm.subarray(s, Math.min(pcm.length, s + 16000 * 7))));
console.log('WINDOWS:   ', words.join(' '));
