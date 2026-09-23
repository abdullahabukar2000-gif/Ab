// QCF V2 font gating.
//
// Every page font maps the same code points to different words, so a glyph
// string shown in any font but its own page's font is wrong Qur'anic text,
// silently. The rule: a caller may render glyph codes only after
// `ensureFont` has resolved `true` for that exact family. Until then it shows
// Unicode Uthmani text instead.

const pending = new Map<string, Promise<boolean>>();
const confirmed = new Set<string>();

export const pageFamily = (page: number) => `qcf2-p${page}`;
export const BASMALAH_FAMILY = 'qcf2-bsml';

// Where each font file lives. In the published app the 600-odd fonts sit in
// the artifact's file store, listed in data/fonts.json (name -> address);
// during development they're served from public/fonts/qcf2/.
let urls: Record<string, string> = {};
export async function loadFontUrls(): Promise<void> {
  try {
    const res = await fetch('data/fonts.json');
    if (res.ok) urls = await res.json();
  } catch { /* development: local files */ }
}

const fontUrl = (family: string) => {
  const name = family === BASMALAH_FAMILY ? 'bsml' : family.slice('qcf2-'.length);
  return urls[name] ?? `fonts/qcf2/${name}.ttf`;
};

export function isConfirmed(family: string): boolean {
  return confirmed.has(family);
}

export function ensureFont(family: string, sample: string): Promise<boolean> {
  let job = pending.get(family);
  if (!job) {
    job = load(family, sample);
    pending.set(family, job);
    // A failed load may be retried later (for example once back online).
    job.then((ok) => { if (!ok) pending.delete(family); });
  }
  return job;
}

async function load(family: string, sample: string): Promise<boolean> {
  try {
    const res = await fetch(fontUrl(family));
    if (!res.ok) return false;
    const face = new FontFace(family, await res.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    // `document.fonts.check` alone is not proof: it also answers true when no
    // face with that name exists at all. Require our own face to be loaded
    // and registered, then ask the browser to confirm it covers the sample.
    const ok = face.status === 'loaded' && document.fonts.has(face) && document.fonts.check(`16px "${family}"`, sample);
    if (ok) confirmed.add(family);
    return ok;
  } catch {
    return false;
  }
}
