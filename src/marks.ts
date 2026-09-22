// The mushaf page stays clean: only the phrase you tap is marked, with a wash
// of at most 8% and a 2px baseline rule, drawn in a layer behind the text so
// nothing is ever painted over the Arabic.

import { phraseAt } from './notes';

export interface Selection { verseKey: string; start: number }

export function paintMarks(pageEl: HTMLElement, selection: Selection | null): void {
  let layer = pageEl.querySelector<HTMLElement>('.marks');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'marks';
    layer.setAttribute('aria-hidden', 'true');
    pageEl.prepend(layer);
  }
  if (!selection || pageEl.dataset.glyphs !== 'ready') { layer.replaceChildren(); return; }

  const phrase = phraseAt(selection.verseKey, selection.start);
  if (!phrase) { layer.replaceChildren(); return; }
  const origin = pageEl.getBoundingClientRect();
  const em = parseFloat(getComputedStyle(pageEl).fontSize);
  const bands: HTMLElement[] = [];

  for (const line of pageEl.querySelectorAll<HTMLElement>('.line.text')) {
    const rects = [...line.querySelectorAll<HTMLElement>(`.w[data-key="${selection.verseKey}"]:not(.end)`)]
      .filter((s) => { const i = Number(s.dataset.pos) - 1; return i >= phrase.start && i <= phrase.end; })
      .map((s) => s.getBoundingClientRect());
    if (!rects.length) continue;
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const band = document.createElement('div');
    band.className = 'mark';
    // Reach a little into the word gaps; sit the rule just clear of the lowest kasra.
    const pad = 0.06 * em;
    Object.assign(band.style, {
      left: `${left - origin.left - pad}px`,
      width: `${right - left + 2 * pad}px`,
      top: `${top - origin.top}px`,
      height: `${bottom - top + 0.14 * em}px`,
    });
    bands.push(band);
  }
  layer.replaceChildren(...bands);
}
