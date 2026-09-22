// Phrase marks are drawn as a layer behind the text, not as styles on the
// words, so a phrase reads as one continuous band across the word gaps and
// nothing is ever painted over the Arabic.

import { isCut, phraseAt } from './notes';

export interface Selection { verseKey: string; start: number }

const wordIndex = (span: HTMLElement) => Number(span.dataset.pos) - 1;

export function paintMarks(pageEl: HTMLElement, selection: Selection | null): void {
  let layer = pageEl.querySelector<HTMLElement>('.marks');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'marks';
    layer.setAttribute('aria-hidden', 'true');
    pageEl.prepend(layer);
  }
  if (pageEl.dataset.glyphs !== 'ready') { layer.replaceChildren(); return; }

  const origin = pageEl.getBoundingClientRect();
  const em = parseFloat(getComputedStyle(pageEl).fontSize);
  const bands: HTMLElement[] = [];

  for (const line of pageEl.querySelectorAll<HTMLElement>('.line.text')) {
    let run: { key: string; start: number; tone: string; left: number; right: number; top: number; bottom: number } | null = null;
    const flush = () => {
      if (!run) return;
      const band = document.createElement('div');
      const active = selection?.verseKey === run.key && selection.start === run.start;
      band.className = active ? 'mark active' : 'mark';
      band.style.setProperty('--tone', `var(--tone-${run.tone})`);
      // Stretch a little into the word gaps so neighbouring words join up.
      const pad = 0.06 * em;
      Object.assign(band.style, {
        left: `${run.left - origin.left - pad}px`,
        width: `${run.right - run.left + 2 * pad}px`,
        top: `${run.top - origin.top}px`,
        // Sit the rule just below the glyph box so it clears the lowest kasra.
        height: `${run.bottom - run.top + 0.14 * em}px`,
      });
      bands.push(band);
      run = null;
    };

    for (const span of line.querySelectorAll<HTMLElement>('.w')) {
      const key = span.dataset.key!;
      if (span.classList.contains('end') || !isCut(key)) { flush(); continue; }
      const phrase = phraseAt(key, wordIndex(span))!;
      const r = span.getBoundingClientRect();
      if (run && run.key === key && run.start === phrase.start) {
        run.left = Math.min(run.left, r.left);
        run.right = Math.max(run.right, r.right);
        run.top = Math.min(run.top, r.top);
        run.bottom = Math.max(run.bottom, r.bottom);
      } else {
        flush();
        run = { key, start: phrase.start, tone: phrase.tone, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }
    }
    flush();
  }
  layer.replaceChildren(...bands);
}
