// Verse by verse: each ayah of the pages on screen as a stack of phrase
// cards. Tap a card to fill in its English; drag the handle between two cards
// to move words from one to the other.

import { ayahGlyphs, getPage, phraseGloss, surahOfPage, TRANSLATION_NAME, translationOf } from './data';
import { ensureFont, isConfirmed, pageFamily } from './fonts';
import { moveBreak, phrasesOf, resetToSuggested, toggleBreak, updatePhrase, usesSuggestion, type Phrase } from './notes';
import { ayahLabel, h, noteField } from './panel';

export interface VerseOptions { coverTranslations: boolean }

const revealedTranslations = new Set<string>();
/** Cards showing their English, by "verseKey@start". */
const openCards = new Set<string>();
/** How far the pointer moves to shift one word across a boundary. */
const DRAG_STEP = 26;

export function renderVerses(pageNumbers: number[], options: VerseOptions): HTMLElement {
  const root = h('div', { class: 'verses' });
  root.append(h('p', { class: 'verses-hint' },
    'Tap a group to see its meaning. Drag the handle between two groups to move words across; drag a group down to nothing to join it.'));
  const seen = new Set<string>();
  for (const n of pageNumbers) {
    const data = getPage(n);
    if (!data) continue;
    const chapter = surahOfPage(data);
    root.append(h('p', { class: 'verses-page' }, `${chapter?.name_complex ?? ''} · page ${n}`));
    for (const key of data.verses) {
      if (seen.has(key)) continue;
      seen.add(key);
      root.append(renderAyah(key, options));
    }
  }
  root.append(h('p', { class: 'verses-source' }, `Word by word: quran.com. Translation: ${TRANSLATION_NAME}.`));
  return root;
}

export function renderAyah(key: string, options: VerseOptions): HTMLElement {
  const article = h('article', { class: 'ayah', id: `ayah-${key.replace(':', '-')}` });
  article.dataset.key = key;
  let current = article;
  const rerender = (focus?: string) => {
    const next = renderAyah(key, options);
    current.replaceWith(next);
    current = next;
    if (focus) next.querySelector<HTMLElement>(focus)?.focus();
  };

  // --- heading: where, and whether the grouping is the suggestion or yours
  const suggestedNow = usesSuggestion(key);
  const head = h('header', { class: 'ayah-head' },
    h('span', { class: 'ayah-num' }, ayahLabel(key)),
    h('span', { class: 'ayah-status' }, suggestedNow ? 'suggested groups' : 'your groups'));
  if (!suggestedNow) {
    const reset = h('button', { type: 'button', class: 'ayah-reset' }, 'use suggestion');
    reset.addEventListener('click', () => { resetToSuggested(key); rerender(); });
    head.append(reset);
  }

  // --- the phrase cards, with a drag handle between each pair
  const phrases = phrasesOf(key);
  const glyphs = ayahGlyphs(key);
  const cards = h('div', { class: 'cards' });
  phrases.forEach((p, i) => {
    cards.append(card(key, p, glyphs, i === phrases.length - 1, rerender));
    if (i < phrases.length - 1) cards.append(handle(key, p, rerender));
  });

  // --- the whole ayah's translation, optionally covered for recall
  const translation = translationOf(key) ?? 'No translation saved for this ayah yet.';
  let tr: HTMLElement;
  if (options.coverTranslations && !revealedTranslations.has(key)) {
    tr = h('button', { type: 'button', class: 'ayah-cover' }, 'Full translation hidden. Tap to check yourself.');
    tr.addEventListener('click', () => { revealedTranslations.add(key); rerender(); });
  } else {
    tr = h('p', { class: 'ayah-translation' }, translation);
    if (options.coverTranslations) {
      tr.classList.add('tappable');
      tr.addEventListener('click', () => { revealedTranslations.delete(key); rerender(); });
    }
  }

  article.append(head, cards, tr);
  return article;
}

function card(key: string, p: Phrase, glyphs: ReturnType<typeof ayahGlyphs>, last: boolean, rerender: (focus?: string) => void): HTMLElement {
  const id = `${key}@${p.start}`;
  const open = openCards.has(id);
  const el = h('div', { class: `card${open ? ' open' : ''}` });

  // The Arabic is the button: tap to fill in (or hide) the English.
  const face = h('button', { type: 'button', class: 'card-face', 'aria-expanded': String(open), dir: 'rtl', lang: 'ar' });
  for (const { page, word } of glyphs) {
    const i = word.pos - 1;
    const inPhrase = word.type === 'word' ? i >= p.start && i <= p.end : last;
    if (!inPhrase) continue;
    const span = h('span', { class: word.type === 'end' ? 'vw end' : 'vw' }, word.uthmani);
    span.dataset.page = String(page);
    span.dataset.code = word.code;
    face.append(span, ' ');
  }
  upgradeGlyphs(face);
  face.addEventListener('click', () => {
    if (open) openCards.delete(id); else openCards.add(id);
    rerender(`.card-face[data-id="${CSS.escape(id)}"]`);
  });
  face.dataset.id = id;
  el.append(face);

  if (open) {
    const gloss = phraseGloss(key, p.start, p.end);
    el.append(h('p', { class: 'card-gloss' }, gloss ?? 'No word-by-word English saved for this ayah yet.'));
    // Your own writing stays folded away unless there is some.
    const mine = h('details', { class: 'card-mine-fields' },
      h('summary', {}, p.meaning || p.note ? 'Your meaning and note' : 'Add your own meaning or note'),
      noteField('Your meaning', `c-meaning-${key}-${p.start}`, p.meaning, 'Your own words for this group',
        (v) => updatePhrase(key, p.start, { meaning: v })),
      noteField('Note', `c-note-${key}-${p.start}`, p.note, 'Memorisation note',
        (v) => updatePhrase(key, p.start, { note: v })));
    if (p.meaning || p.note) (mine as HTMLDetailsElement).open = true;
    el.append(mine);
    if (p.end > p.start) {
      const split = h('button', { type: 'button', class: 'card-split' }, 'Split in two');
      split.addEventListener('click', () => {
        toggleBreak(key, p.start + Math.floor((p.end - p.start - 1) / 2));
        rerender();
      });
      el.append(split);
    }
  } else if (p.meaning) {
    el.append(h('p', { class: 'card-mine' }, p.meaning));
  }
  return el;
}

/**
 * The boundary after phrase `p`. Drag it down to pull the next group's first
 * words up into this one, or up to push this group's last words down. Arrow
 * keys do the same one word at a time.
 */
function handle(key: string, p: Phrase, rerender: (focus?: string) => void): HTMLElement {
  const grip = h('button', {
    type: 'button',
    class: 'handle',
    'aria-label': 'Move the boundary between these two groups: drag, or use the up and down arrow keys',
  });
  grip.dataset.end = String(p.end);
  const focusSel = (end: number) => `.handle[data-end="${end}"]`;

  grip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    moveBreak(key, p.end, p.end + step);
    rerender(focusSel(p.end + step));
  });

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    let end = p.end;
    let moved = false;
    document.body.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      const target = p.end + Math.round((ev.clientY - startY) / DRAG_STEP);
      if (target === end) return;
      moveBreak(key, end, target);
      moved = true;
      // If the move joined the groups there is no boundary left to drag.
      const still = phrasesOf(key).some((q) => q.end === target);
      end = target;
      rerender(still ? focusSel(target) : undefined);
      document.querySelector(`[data-key="${key}"] ${focusSel(target)}`)?.classList.add('active');
      if (!still) stop();
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('dragging');
      document.querySelectorAll('.handle.active').forEach((n) => n.classList.remove('active'));
      if (!moved) grip.focus();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    grip.classList.add('active');
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
