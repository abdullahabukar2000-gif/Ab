// A first guess at an ayah's phrases, for the memoriser to correct.
//
// It proposes only where the breath-groups fall, never what they mean:
//  1. the mushaf's own pause signs (ṣalā ۖ, qalā ۗ, lāzim ۘ, jāʾiz ۚ) always
//     end a phrase;
//  2. the stretches between them are cut into groups of about three to five
//     words, preferring to cut after an indefinite noun (tanwīn) or before a
//     word that opens a clause (wa-, fa-, thumma, inna, alladhīna, illā ...),
//     and never after a small word that leans on the next one (mā, min, fī ...).

const PAUSE = /[ۖۗۘۚ]/;
const TANWEEN = /[ً-ࣰٍ-ࣲ]/;
// Letters only: drop harakat, Qur'anic annotation marks and tatweel; wasla alif to alif.
const skeleton = (w: string) =>
  w.replace(/[ؐ-ًؚ-ٰٟۖ-ࣰۭ-ࣿـ\s]/g, '').replace(/ٱ/g, 'ا');

const OPENERS = new Set(['ثم', 'ان', 'إن', 'أن', 'إنا', 'إنه', 'إنما', 'أنما', 'الذين', 'الذى', 'الذي', 'التى', 'التي', 'إلا', 'لعل', 'لعلكم', 'حتى', 'كى', 'كي', 'لكن', 'بل', 'قل', 'قال', 'قالوا', 'يوم', 'أولئك', 'أولـئك']);
const PREPOSITIONS = new Set(['من', 'فى', 'في', 'على', 'إلى', 'عن', 'عند', 'بين']);
// Small words that lean on the word after them: a phrase shouldn't end on one.
const LEANING = new Set(['ما', 'لا', 'لم', 'لن', 'من', 'فى', 'في', 'على', 'إلى', 'عن', 'إن', 'أن', 'قد', 'يا', 'ثم', 'أم', 'أو', 'بل', 'بما', 'مما', 'لما', 'كما', 'إذا', 'إذ', 'لو', 'هل', 'ذلك', 'الذين', 'الذى', 'الذي', 'التى', 'التي']);

function opensClause(word: string): number {
  const s = skeleton(word);
  if (OPENERS.has(s)) return 1.2;
  // wa- / fa- joined to a word (but not fī "in", fīhā ... which merely start with fā)
  if (s.length > 2 && (s[0] === 'و' || (s[0] === 'ف' && s[1] !== 'ى' && s[1] !== 'ي'))) return 1.4;
  if (PREPOSITIONS.has(s)) return 0.4;
  return 0;
}

const lengthCost = [0, 3, 0.7, 0, 0, 0.5, 1.8, 5, 9, 14];
const costOf = (len: number) => lengthCost[len] ?? 20 + len;

/** Split one pause-free stretch into groups; returns break positions (index of each group's last word). */
function segment(words: string[], from: number, to: number): number[] {
  const n = to - from + 1;
  if (n <= 5) return [];
  const best: number[] = Array(n + 1).fill(Infinity);
  const back: number[] = Array(n + 1).fill(0);
  best[0] = 0;
  for (let end = 1; end <= n; end++) {
    for (let start = Math.max(0, end - 9); start < end; start++) {
      let cost = best[start] + costOf(end - start);
      if (end < n) {
        const last = words[from + end - 1];
        const next = words[from + end];
        // After an indefinite noun is a natural pause, unless an adjective follows it.
        if (TANWEEN.test(last) && !TANWEEN.test(next)) cost -= 1.1;
        if (TANWEEN.test(last) && TANWEEN.test(next)) cost += 0.6;
        if (LEANING.has(skeleton(last))) cost += 2.5;
        // Two definite words in a row are usually a noun and its adjective.
        if (/^(ال|لل)/.test(skeleton(last)) && /^ال/.test(skeleton(next))) cost += 0.9;
        cost -= opensClause(next);
      }
      if (cost < best[end]) { best[end] = cost; back[end] = start; }
    }
  }
  const cuts: number[] = [];
  for (let end = back[n]; end > 0; end = back[end]) cuts.push(from + end - 1);
  return cuts.reverse();
}

export function suggestBreaks(words: string[]): number[] {
  const breaks: number[] = [];
  let start = 0;
  words.forEach((w, i) => {
    const last = i === words.length - 1;
    if (last || PAUSE.test(w)) {
      breaks.push(...segment(words, start, i));
      if (!last) breaks.push(i);
      start = i + 1;
    }
  });
  return breaks;
}
