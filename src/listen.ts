// Recitation mode: listens to you recite and checks it word by word against
// the page, like Tarteel. Wrong and skipped words are flagged with a sound;
// harakat (tashkeel) and tajweed are not judged.
//
// It runs entirely on the device: the microphone audio goes to an open Quran
// speech model (Tilawi's FastConformer, fine-tuned on recitation) through
// onnxruntime-web, and the transcript is judged against the fixed Quran text
// with @tilawi/quran-asr's word aligner. Nothing is sent anywhere. The model
// (88 MB) is downloaded once, when you first use recitation mode, and kept.

import * as ort from 'onnxruntime-web/wasm';
import { TextCTCDecoder, detectSpeech, overlapMerge, judgeAttempt, normalizeArabic, lcsRatio } from '@tilawi/quran-asr';
import { ayahWords, getChapter, loadPages, pagesOfAyah } from './data';

const MODEL_REPO = 'https://huggingface.co/muhdur/tilawi-fastconformer-quran/resolve/e9448a0e84f3adb64c28b7a8db501dd8e0e59a84/';
const MODEL_FILE = 'fastconformer_full_mixed.onnx';
const MODEL_BYTES = 88_307_366;
const MODEL_SHA256 = '4767182cd92975869f81a7e32700b14ca2b04e8dc97a15ff220a8697f4639488';
const CACHE = 'hifz-recitation-model-v1';
const RATE = 16000;

export type ListenState =
  | { phase: 'idle' }
  | { phase: 'downloading'; done: number; total: number }
  | { phase: 'starting' }
  | { phase: 'listening'; key: string; mistakes: number; heard: number }
  | { phase: 'error'; message: string };

type Listener = (s: ListenState) => void;
const listeners = new Set<Listener>();
let state: ListenState = { phase: 'idle' };
export const listenState = () => state;
export function onListen(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }
function set(next: ListenState): void { state = next; listeners.forEach((fn) => fn(state)); }

/** Word marks for the screen: per ayah, word index -> ok / err. */
export type Marks = Map<string, Map<number, 'ok' | 'err'>>;
type MarksFn = (marks: Marks, reached: { key: string; words: number } | null) => void;
const markFns = new Set<MarksFn>();
export function onMarks(fn: MarksFn): () => void { markFns.add(fn); return () => markFns.delete(fn); }

// ------------------------------------------------------------------ the model

let session: ort.InferenceSession | null = null;
let decoder: TextCTCDecoder | null = null;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Download (once) and start the speech model. */
async function loadModel(): Promise<void> {
  if (session && decoder) return;
  ort.env.wasm.wasmPaths = new URL('ort/', location.href).href;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

  const cache = await caches.open(CACHE);
  let modelRes = await cache.match(MODEL_REPO + MODEL_FILE);
  if (!modelRes) {
    try { await navigator.storage?.persist?.(); } catch { /* optional */ }
    const res = await fetch(MODEL_REPO + MODEL_FILE);
    if (!res.ok || !res.body) throw new Error('download');
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let done = 0;
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      parts.push(value);
      done += value.length;
      set({ phase: 'downloading', done, total: MODEL_BYTES });
    }
    const blob = new Blob(parts as BlobPart[]);
    // Only keep a file that is exactly the published model.
    if (hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())) !== MODEL_SHA256) throw new Error('checksum');
    await cache.put(MODEL_REPO + MODEL_FILE, new Response(blob));
    modelRes = await cache.match(MODEL_REPO + MODEL_FILE);
  }
  set({ phase: 'starting' });
  const vocabRes = (await cache.match(MODEL_REPO + 'vocab.json')) ?? await (async () => {
    const r = await fetch(MODEL_REPO + 'vocab.json');
    if (!r.ok) throw new Error('download');
    await cache.put(MODEL_REPO + 'vocab.json', r.clone());
    return r;
  })();
  decoder = new TextCTCDecoder(await vocabRes.json(), 1024);
  session = await ort.InferenceSession.create(new Uint8Array(await modelRes!.arrayBuffer()), { executionProviders: ['wasm'] });
}

/** Run the model on 16 kHz mono audio and return the heard words. */
async function transcribe(pcm: Float32Array): Promise<string[]> {
  const feeds: Record<string, ort.Tensor> = {
    audio_signal: new ort.Tensor('float32', pcm, [1, pcm.length]),
    length: new ort.Tensor('int64', BigInt64Array.from([BigInt(pcm.length)]), [1]),
  };
  const out = await session!.run(feeds);
  const t = out[session!.outputNames[0]];
  const [, steps, vocab] = t.dims as number[];
  const text = decoder!.decode(t.data as Float32Array, steps, vocab).text;
  return text.split(/\s+/).filter(Boolean);
}

export const modelDownloaded = async () => !!(await (await caches.open(CACHE)).match(MODEL_REPO + MODEL_FILE));
export const MODEL_SIZE_MB = Math.round(MODEL_BYTES / 1e6);

// ------------------------------------------------------------------ the text

interface Expected { key: string; index: number; text: string }
let expected: Expected[] = [];

/** The words from `start` on (a few pages' worth, extended as you go). */
async function extendExpected(from: [number, number], count: number): Promise<void> {
  let [s, a] = from;
  while (expected.length < count && s <= 114) {
    const key = `${s}:${a}`;
    await loadPages(pagesOfAyah(key));
    ayahWords(key).forEach((text, index) => expected.push({ key, index, text }));
    if (a < (getChapter(s)?.verses_count ?? 0)) a++; else { s++; a = 1; }
  }
}

// ------------------------------------------------------------------ listening

let audioCtx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioNode | null = null;
let chunks: Float32Array[] = [];
let samples = 0;
let running = false;
let loopTimer: number | undefined;

// Judging state: words before `base` are settled; the rest is judged afresh each time.
let base = 0; // index into `expected`
let heardSettled: string[] = []; // heard words already matched to expected[0..base)
let heard: string[] = []; // all heard words
let windowStart = 0; // sample where the not-yet-committed audio starts
let committed: string[] = [];
let located = false;
const settledMarks: Marks = new Map();
let flagged = new Set<number>(); // expected indices already beeped for
let lastErr = new Set<number>(); // judged wrong last time round
const shownErr = new Set<number>(); // shown as wrong now
let mistakes = 0;

let chunksFrom = 0; // sample where chunks[0] starts (older audio is let go)

function allAudio(from: number): Float32Array {
  while (chunks.length > 1 && chunksFrom + chunks[0].length <= from) chunksFrom += chunks.shift()!.length;
  const out = new Float32Array(samples - from);
  let pos = 0, skip = from - chunksFrom;
  for (const c of chunks) {
    if (skip >= c.length) { skip -= c.length; continue; }
    const part = c.subarray(skip);
    out.set(part, pos);
    pos += part.length;
    skip = 0;
  }
  return out;
}

/** Start listening from an ayah (you may start anywhere in the next page or so). */
export async function startListening(from: [number, number], ctx?: AudioContext): Promise<void> {
  if (running) { void ctx?.close().catch(() => undefined); return; }
  try {
    set({ phase: 'starting' });
    // Best started during the tap itself (iPhone won't allow it later), so the
    // caller passes one in.
    audioCtx = ctx ?? new AudioContext();
    void audioCtx.resume().catch(() => undefined);
    // iPhone: let the app's sounds play while the mic is on.
    try { (navigator as Navigator & { audioSession?: { type: string } }).audioSession!.type = 'play-and-record'; } catch { /* older iOS / other browsers */ }
    // Plain microphone audio: phone "voice call" processing distorts recitation.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    await loadModel();
    expected = [];
    await extendExpected(from, 400);
    base = 0; heardSettled = []; heard = []; committed = []; chunks = []; chunksFrom = 0; samples = 0; windowStart = 0; stitchNext = false;
    located = false; settledMarks.clear(); flagged = new Set(); lastErr = new Set(); shownErr.clear(); mistakes = 0;

    // Record at the device's own rate and convert to 16 kHz here (asking the
    // browser for a 16 kHz context isn't reliable everywhere).
    const src = audioCtx.createMediaStreamSource(stream);
    const resample = resampler(audioCtx.sampleRate);
    const began = performance.now();
    let reported = false;
    const take = (input: Float32Array) => {
      if (!running) return;
      const data = resample(input);
      chunks.push(data);
      samples += data.length;
      if (!reported && samples > 5 * RATE) {
        reported = true;
        let sum = 0;
        for (const x of data) sum += x * x;
        console.info(`recitation: mic ${audioCtx?.sampleRate} Hz, ${(samples / RATE).toFixed(1)} s recorded in ${((performance.now() - began) / 1000).toFixed(1)} s, level ${Math.sqrt(sum / data.length).toFixed(4)}`);
      }
    };
    // Record on the audio thread where possible: the page is busy for a second
    // or two each time it listens back, and the older way drops sound then.
    try {
      await audioCtx.audioWorklet.addModule(new URL('mic-worklet.js', location.href).href);
      const w = new AudioWorkletNode(audioCtx, 'mic');
      w.port.onmessage = (e) => take(e.data as Float32Array);
      w.connect(audioCtx.destination); // silent; keeps it running everywhere
      node = w;
    } catch {
      const sp = audioCtx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => take(new Float32Array(e.inputBuffer.getChannelData(0)));
      sp.connect(audioCtx.destination);
      node = sp;
    }
    src.connect(node);
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    running = true;
    set({ phase: 'listening', key: expected[0]?.key ?? '', mistakes: 0, heard: 0 });
    chime();
    loop();
  } catch (e) {
    stopListening();
    const msg = (e as Error).name === 'NotAllowedError'
      ? 'Microphone access was refused. Allow it in Settings → Safari → Microphone (or remove and re-add the app).'
      : (e as Error).message === 'checksum' ? 'The recitation checker didn’t download correctly. Try again on Wi-Fi.'
      : !navigator.onLine ? 'You’re offline. The recitation checker must be downloaded once, on Wi-Fi.'
      : (e as Error).message === 'download' || (e as Error).name === 'TypeError' && !session ? 'Couldn’t download the recitation checker. Check your connection and try again.'
      : 'Recitation mode couldn’t start on this device.';
    set({ phase: 'error', message: msg });
  }
}

export function stopListening(): void {
  running = false;
  clearTimeout(loopTimer);
  node?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  void audioCtx?.close().catch(() => undefined);
  node = null; stream = null; audioCtx = null;
  if (state.phase !== 'error') set({ phase: 'idle' });
}

/** Streaming conversion to 16 kHz: each output sample averages the input it covers. */
function resampler(inRate: number): (input: Float32Array) => Float32Array {
  const step = inRate / RATE;
  let carry = new Float32Array(0);
  let pos = 0; // position of the next output sample within `carry + input`
  return (input) => {
    const buf = new Float32Array(carry.length + input.length);
    buf.set(carry);
    buf.set(input, carry.length);
    const out: number[] = [];
    while (pos + step <= buf.length) {
      const a = Math.floor(pos), b = Math.max(a + 1, Math.floor(pos + step));
      let sum = 0;
      for (let i = a; i < b; i++) sum += buf[i];
      out.push(sum / (b - a));
      pos += step;
    }
    const keep = Math.floor(pos);
    carry = buf.slice(keep);
    pos -= keep;
    return Float32Array.from(out);
  };
}

// What you've said so far is heard in pieces. Once a piece is ~10 s long
// (shorter pieces were quicker but misheard more words) it's
// cut at the quietest moment near its end (the pause between words or ayahs),
// heard once more up to there and kept; listening carries on from the cut. Only
// if there's no pause at all is it cut with an overlap and the two stitched.
const WINDOW = 10 * RATE;
const LONGEST = 18 * RATE;
const OVERLAP = 2 * RATE;
let stitchNext = false; // the kept words end in an overlap with what comes next

const join = (words: string[]) => (stitchNext ? overlapMerge(committed, words) : committed.concat(words));

/** The quietest ~300 ms after the first 3 s, as a sample offset, if it's a real pause. */
function quietCut(pcm: Float32Array): number {
  const F = RATE / 50; // 20 ms frames
  const rms: number[] = [];
  for (let i = 0; i + F <= pcm.length; i += F) {
    let sum = 0;
    for (let j = i; j < i + F; j++) sum += pcm[j] * pcm[j];
    rms.push(Math.sqrt(sum / F));
  }
  const typical = [...rms].sort((x, y) => x - y)[Math.floor(rms.length * 0.7)] || 0;
  const W = 15; // frames per quiet spot (~300 ms)
  let best = -1, bestLevel = Infinity;
  for (let f = 150; f + W < rms.length - 15; f++) {
    let level = 0;
    for (let k = 0; k < W; k++) level += rms[f + k];
    if (level < bestLevel) { bestLevel = level; best = f; }
  }
  if (best < 0 || bestLevel / W > typical * 0.12) return -1;
  return (best + W / 2) * F;
}

async function loop(): Promise<void> {
  if (!running) return;
  const started = performance.now();
  try {
    if (samples - windowStart >= RATE / 2) {
      const pcm = allAudio(windowStart);
      if (!detectSpeech(pcm)) {
        // Silence: nothing to hear; don't let it pile up.
        if (pcm.length > 3 * RATE) { windowStart += pcm.length - RATE; stitchNext = false; }
      } else {
        const t0 = performance.now();
        const cut = pcm.length >= WINDOW ? quietCut(pcm) : -1;
        if (cut > 0) {
          committed = join(await transcribe(pcm.subarray(0, cut)));
          windowStart += cut;
          stitchNext = false;
          heard = committed;
        } else if (pcm.length >= LONGEST) {
          committed = join(await transcribe(pcm));
          windowStart += pcm.length - OVERLAP;
          stitchNext = true;
          heard = committed;
        } else {
          heard = join(await transcribe(pcm));
        }
        console.info(`recitation: ${(pcm.length / RATE).toFixed(1)} s of audio heard in ${Math.round(performance.now() - t0)} ms${cut > 0 ? `, kept up to a pause at ${(cut / RATE).toFixed(1)} s` : ''}`);
        if (!running) return;
        judge();
      }
    }
  } catch { /* try again next round */ }
  // Again straight away (the phone is only ever busy with one listen at a time).
  const spent = performance.now() - started;
  loopTimer = window.setTimeout(loop, Math.max(60, 400 - spent));
}

/**
 * Find where you started: the first run of heard words that matches a run of
 * the page's words (anywhere in the first ~400). Anything heard before it
 * (noise, a cough, the isti'adha) is set aside.
 */
function locate(): boolean {
  const H = heard.map(normalizeArabic);
  const E = expected.slice(0, 420).map((e) => normalizeArabic(e.text));
  // Heard as that word, or near enough (the model can drop or blur a letter).
  const same = (e: string, h: string | undefined) => !!h && (e === h || (e.length >= 3 && lcsRatio(e, h) >= 0.75));
  // Right where you said you'd start, 3 words in a row are enough; anywhere
  // further on it takes 4 of 5, and not just short common words.
  const found = (j: number): number => {
    for (let i = 0; i + 3 <= Math.min(E.length, 30); i++) {
      if ([0, 1, 2].every((k) => same(E[i + k], H[j + k])) && E[i].length + E[i + 1].length + E[i + 2].length >= 7) return i;
    }
    if (j + 5 > H.length) return -1;
    for (let i = 0; i + 5 <= E.length; i++) {
      // Starting on a match, so the start isn't put a word early.
      if (!same(E[i], H[j])) continue;
      let hits = 0, letters = 0;
      for (let k = 0; k < 5; k++) if (same(E[i + k], H[j + k])) { hits++; letters += E[i + k].length; }
      if (hits >= 4 && letters >= 14) return i;
    }
    return -1;
  };
  for (let j = 0; j + 3 <= H.length; j++) {
    const at = found(j);
    if (at < 0) continue;
    // Walk back over any earlier words that also match (e.g. a first word
    // the model heard slightly differently).
    let i = at, h = j;
    while (i > 0 && h > 0 && same(E[i - 1], H[h - 1])) { i--; h--; }
    base = i;
    heardSettled = heard.slice(0, h);
    return true;
  }
  return false;
}

// Where you are: the last word (index into `expected`) confirmed as the next
// word said right, or by three right words out of the last five. It only ever moves forward, so a
// stray word the model mishears as something further on can't pull you there.
let reachedAt = -1;
const AHEAD = 40; // how far past that point your next words are looked for…
const SKIP_AHEAD = 160; // …or further, once it's clear you've jumped ahead (a skipped ayah)

function judge(): void {
  if (!located) {
    located = locate();
    console.info(`recitation: heard "${heard.slice(-14).join(' ')}" | page starts "${expected.slice(0, 6).map((e) => normalizeArabic(e.text)).join(' ')}" | found start: ${located ? expected[base].key + ' word ' + (expected[base].index + 1) : 'no'}`);
    if (!located) return;
    reachedAt = base - 1;
  }
  const said = heard.slice(heardSettled.length);
  const attempt = (ahead: number) => {
    const exp = expected.slice(base, Math.max(base, reachedAt + 1) + ahead);
    // Skipping whole ayahs is cheaper to explain than garbling their words.
    const boundaries = new Set(exp.flatMap((e, i) => (e.index === 0 ? [i] : [])));
    return { exp, result: judgeAttempt(exp.map((e) => e.text), said, { verseBoundaries: boundaries }) };
  };
  const lastHeardUsed = (r: ReturnType<typeof judgeAttempt>) =>
    Math.max(-1, ...r.words.filter((w) => w.judgment === 'correct' && w.recognizedIndex != null).map((w) => w.recognizedIndex!));
  let { exp, result } = attempt(AHEAD);
  // Lots heard that matches nothing close by: look further ahead.
  if (said.length - 1 - lastHeardUsed(result) >= 8) ({ exp, result } = attempt(SKIP_AHEAD));

  // Progress counts words heard right, and ones heard nearly right (the
  // model's "unsure"): they aren't marked green, but you've clearly said them.
  const correct = result.words
    .filter((w) => (w.judgment === 'correct' || (w.judgment === 'uncertain' && w.recognizedIndex != null)) && w.expectedIndex != null)
    .map((w) => base + w.expectedIndex!);
  const isCorrect = new Set(correct);
  for (const c of correct) {
    if (c <= reachedAt) continue;
    // The very next word, said right: follow straight away.
    if (c === reachedAt + 1) { reachedAt = c; continue; }
    let n = 0;
    for (let k = c - 4; k <= c; k++) if (isCorrect.has(k) || (k <= reachedAt && k >= base)) n++;
    if (n >= 3) reachedAt = c;
  }

  const marks: Marks = new Map([...settledMarks].map(([k, v]) => [k, new Map(v)]));
  const mark = (e: Expected, m: 'ok' | 'err') => {
    let per = marks.get(e.key);
    if (!per) marks.set(e.key, (per = new Map()));
    per.set(e.index, m);
  };
  let newMistake = false;
  const errNow = new Set<number>();
  for (const w of result.words) {
    if (w.expectedIndex == null || w.operation === 'unattempted') continue;
    const at = base + w.expectedIndex;
    if (at > reachedAt) continue; // not there yet
    const e = exp[w.expectedIndex];
    if (w.judgment === 'correct') mark(e, 'ok');
    // Only called wrong once you've carried on correctly past it (the newest
    // words heard can still change as more is heard), and only if it's still
    // wrong the next time round.
    else if (w.judgment === 'apparent-error' && at < reachedAt - 2) {
      errNow.add(at);
      if (!lastErr.has(at)) continue;
      mark(e, 'err');
      shownErr.add(at);
      if (!flagged.has(at)) {
        // A run of wrong or skipped words (a missed ayah, say) is one mistake, one sound.
        // (Words up to two apart count as the same run.)
        if (![at - 2, at - 1, at + 1, at + 2].some((i) => flagged.has(i))) newMistake = true;
        flagged.add(at);
      }
    }
  }
  lastErr = errNow;
  // Anything shown wrong earlier that's now heard right stops counting.
  for (const i of [...shownErr]) if (i >= base && !errNow.has(i)) shownErr.delete(i);
  const all = [...shownErr].sort((x, y) => x - y);
  mistakes = all.filter((v, i) => i === 0 || v - all[i - 1] > 2).length;
  if (newMistake) beep();
  const at = reachedAt >= base ? expected[reachedAt] : null;
  console.info(`recitation: at ${at?.key ?? '-'} · heard "${said.slice(-8).join(' ')}" · ${mistakes} mistakes`);

  // Settle everything well behind where you are, so the work stays small.
  const rel = reachedAt - base;
  if (rel > 40) {
    const upTo = rel - 20;
    const anchor = result.words.find((w) => w.expectedIndex === upTo && w.recognizedIndex != null);
    if (anchor) {
      for (const [k, v] of marks) settledMarks.set(k, new Map(v));
      heardSettled = heard.slice(0, heardSettled.length + anchor.recognizedIndex!);
      base += upTo;
      if (expected.length - base < 200) void extendExpected(nextAfter(expected[expected.length - 1].key), expected.length + 400);
    }
  }

  set({ phase: 'listening', key: at?.key ?? expected[base]?.key ?? '', mistakes, heard: heard.length });
  markFns.forEach((fn) => fn(marks, at ? { key: at.key, words: at.index + 1 } : null));
}

function nextAfter(key: string): [number, number] {
  const [s, a] = key.split(':').map(Number);
  return a < (getChapter(s)?.verses_count ?? 0) ? [s, a + 1] : [s + 1, 1];
}

function tones(notes: [freq: number, at: number][], volume: number, length: number): void {
  try {
    const ctx = audioCtx ?? new AudioContext();
    const t = ctx.currentTime + 0.02;
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(volume, t + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + at);
      osc.stop(t + at + length + 0.02);
    }
  } catch { /* no sound available */ }
}

/** Listening has started: a short rising chime. */
const chime = () => tones([[523, 0], [784, 0.12]], 0.6, 0.16);

/** A mistake: a clear falling two-note sound. */
const beep = () => tones([[466, 0], [311, 0.16]], 0.9, 0.2);
