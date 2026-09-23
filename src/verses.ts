// Verse by verse, like quran.com's: each ayah flows across the line, its
// phrase groups each in a box. Below it sits one English line built from
// the boxes: tap a box to reveal or hide its part. Drag the edge between two
// boxes sideways to move words from one to the other.

import { ayahGlyphs, getPage, phraseGloss, surahOfPage, TRANSLATION_NAME, translationOf } from './data';
import { ensureFont, isConfirmed, pageFamily } from './fonts';
import { moveBreak, phrasesOf, resetToSuggested, toggleBreak, usesSuggestion, type Phrase } from './notes';
import { ayahLabel, h } from './dom';

export interface VerseOptions { coverTranslations: boolean }

/** Which boxes show their English, per ayah, once the memoriser has tapped any. */
const revealed = new Map<string, Set<number>>();
/** Ayahs showing the full Clear Quran sentence instead of the box-by-box English. */
const fullSentence = new Set<string>();

/** Called when "hide translations" is switched: every ayah goes back to the new default. */
export function resetReveals(): void { revealed.clear(); }

const isRevealed = (key: string, start: number, options: VerseOptions) =>
  revealed.get(key)?.has(start) ?? !options.coverTranslations;

function toggleReveal(key: string, start: number, phrases: Phrase[], options: VerseOptions): void {
  let set = revealed.get(key);
  if (!set) {
    set = new Set(options.coverTranslations ? [] : phrases.map((p) => p.start));
    revealed.set(key, set);
  }
  if (set.has(start)) set.delete(start); else set.add(start);
}

export function renderVerses(pageNumbers: number[], options: VerseOptions): HTMLElement {
  const root = h('div', { class: 'verses' });
  root.append(h('p', { class: 'verses-hint' },
    'Tap a box to show or hide its English. Drag the edge between two boxes left or right to move words across. Double-tap a word to split its box there.'));
  const seen = new Set<string>();
  for (const n of pageNumbers) {
    const data = getPage(n);
    if (!data) continue;
    const chapter = surahOfPage(data);
    const heading = h('p', { class: 'verses-page' }, `${chapter?.name_complex ?? ''} · page ${n}`);
    heading.dataset.page = String(n);
    root.append(heading);
    for (const key of data.verses) {
      if (seen.has(key)) continue;
      seen.add(key);
      root.append(renderAyah(key, options));
    }
  }
  root.append(h('p', { class: 'verses-source' }, `English by box: quran.com word by word. Full sentence: ${TRANSLATION_NAME}.`));
  return root;
}

export function renderAyah(key: string, options: VerseOptions): HTMLElement {
  const article = h('article', { class: 'ayah', id: `ayah-${key.replace(':', '-')}` });
  article.dataset.key = key;
  let current = article;
  const rerender = () => {
    const next = renderAyah(key, options);
    current.replaceWith(next);
    current = next;
    return next;
  };

  // --- heading: where, and whether the grouping is the suggestion or yours
  const suggestedNow = usesSuggestion(key);
  const head = h('header', { class: 'ayah-head' },
    h('span', { class: 'ayah-num' }, key),
    h('span', { class: 'ayah-name' }, ayahLabel(key).replace(/ \d+$/, '')),
    h('span', { class: 'ayah-status' }, suggestedNow ? 'suggested groups' : 'your groups'));
  if (!suggestedNow) {
    const reset = h('button', { type: 'button', class: 'ayah-reset' }, 'use suggestion');
    reset.addEventListener('click', () => { resetToSuggested(key); rerender(); });
    head.append(reset);
  }

  // --- the ayah, flowing across the line, one box per phrase
  const phrases = phrasesOf(key);
  const glyphs = ayahGlyphs(key);
  const text = h('div', { class: 'ayah-text', dir: 'rtl', lang: 'ar' });
  phrases.forEach((p, i) => {
    const last = i === phrases.length - 1;
    const open = isRevealed(key, p.start, options);
    const box = h('button', { type: 'button', class: `box${open ? ' open' : ''}`, 'aria-pressed': String(open) });
    box.dataset.start = String(p.start);
    for (const { page, word } of glyphs) {
      const w = word.pos - 1;
      if (word.type !== 'word' || w < p.start || w > p.end) continue;
      const span = h('span', { class: 'vw' }, word.uthmani);
      span.dataset.page = String(page);
      span.dataset.code = word.code;
      span.dataset.index = String(w);
      box.append(span);
    }
    box.addEventListener('click', () => { toggleReveal(key, p.start, phrases, options); rerender(); });
    box.addEventListener('dblclick', (e) => {
      const index = Number((e.target as HTMLElement).closest<HTMLElement>('.vw')?.dataset.index);
      if (Number.isInteger(index) && index < p.end) { toggleBreak(key, index); rerender(); }
    });

    const unit = h('span', { class: 'box-unit' }, box);
    if (!last) unit.append(edge(key, p, rerender));
    else {
      const marker = glyphs.find((g) => g.word.type === 'end');
      if (marker) {
        const span = h('span', { class: 'vw end' }, marker.word.uthmani);
        span.dataset.page = String(marker.page);
        span.dataset.code = marker.word.code;
        unit.append(span);
      }
    }
    text.append(unit);
  });
  upgradeGlyphs(text);

  article.append(head, text, english(key, phrases, options, rerender));
  return article;
}

/**
 * The one English line under the ayah. Box by box it holds each box's words
 * in English, shown only for the boxes you've revealed; or, on request, the
 * full translated sentence.
 */
function english(key: string, phrases: Phrase[], options: VerseOptions, rerender: () => void): HTMLElement {
  const wrap = h('div', { class: 'ayah-english' });
  const switcher = h('button', { type: 'button', class: 'english-switch' });
  switcher.addEventListener('click', () => {
    if (fullSentence.has(key)) fullSentence.delete(key); else fullSentence.add(key);
    rerender();
  });

  if (fullSentence.has(key)) {
    wrap.append(h('p', { class: 'english-line' }, translationOf(key) ?? 'No translation saved for this ayah yet.'));
    switcher.textContent = '← back to box by box';
  } else {
    const line = h('p', { class: 'english-line' });
    phrases.forEach((p) => {
      const open = isRevealed(key, p.start, options);
      const gloss = phraseGloss(key, p.start, p.end) ?? '…';
      // A hidden part keeps its length as a blank, like a word covered on a flashcard.
      // A span, not a button, so a long part wraps with the sentence like ordinary text.
      const part = h('span', { class: `english-part${open ? ' open' : ''}`, role: 'button', tabindex: '0' }, gloss);
      part.setAttribute('aria-label', open ? gloss : 'Hidden. Tap to reveal.');
      const flip = () => { toggleReveal(key, p.start, phrases, options); rerender(); };
      part.addEventListener('click', flip);
      part.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
      line.append(part, ' ');
    });
    wrap.append(line);
    switcher.textContent = 'show the full sentence';
  }
  wrap.append(switcher);
  return wrap;
}

/**
 * The edge after phrase `p`. Drag it over a word and the boundary moves there:
 * the box before ends at that word. Drag it past a whole box and the two join.
 * Arrow keys move it a word at a time.
 */
function edge(key: string, p: Phrase, rerender: () => HTMLElement): HTMLElement {
  const grip = h('span', {
    class: 'edge',
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Boundary between two groups: drag left or right, or use the arrow keys',
    'aria-valuenow': String(p.end + 1),
  });
  grip.dataset.end = String(p.end);

  grip.addEventListener('keydown', (e) => {
    // Right to left: the left arrow moves the edge on through the ayah.
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    moveBreak(key, p.end, p.end + step);
    rerender().querySelector<HTMLElement>(`.edge[data-end="${p.end + step}"]`)?.focus();
  });

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    let end = p.end;
    document.body.classList.add('dragging');
    let live = grip;
    live.classList.add('active');
    const move = (ev: PointerEvent) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.vw:not(.end)');
      const article = under?.closest<HTMLElement>('.ayah');
      if (!under || article?.dataset.key !== key) return;
      const target = Number(under.dataset.index);
      if (!Number.isInteger(target) || target === end) return;
      moveBreak(key, end, target);
      const next = rerender();
      const still = phrasesOf(key).some((q) => q.end === target);
      if (!still) { stop(); return; }
      end = target;
      live = next.querySelector<HTMLElement>(`.edge[data-end="${target}"]`) ?? live;
      live.classList.add('active');
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('dragging');
      document.querySelectorAll('.edge.active').forEach((n) => n.classList.remove('active'));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });
  return grip;
}

/** Glyph codes only once each word's own page font is confirmed; Unicode until then. */
function upgradeGlyphs(container: HTMLElement): void {
  const byPage = new Map<number, HTMLElement[]>();
  for (const span of container.querySelectorAll<HTMLElement>('.vw')) {
    const page = Number(span.dataset.page);
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push(span);
  }
  for (const [page, spans] of byPage) {
    const family = pageFamily(page);
    const apply = () => spans.forEach((s) => { s.textContent = s.dataset.code!; s.style.fontFamily = `"${family}"`; s.classList.add('glyph'); });
    if (isConfirmed(family)) { apply(); continue; }
    const sample = getPage(page)!.lines.flatMap((l) => l.words.map((w) => w.code)).join('');
    ensureFont(family, sample).then((ok) => { if (ok) apply(); });
  }
}
