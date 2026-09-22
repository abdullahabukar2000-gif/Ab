// Verse by verse: each ayah of the pages on screen, in its mushaf glyphs,
// grouped into phrases you can re-cut with a tap, with the translation below.

import { ayahGlyphs, getPage, surahOfPage, TRANSLATION_NAME, translationOf } from './data';
import { ensureFont, isConfirmed, pageFamily } from './fonts';
import { phrasesOf, resetToSuggested, toggleBreak, updatePhrase, usesSuggestion } from './notes';
import { ayahLabel, h, noteField } from './panel';

export interface VerseOptions { coverTranslations: boolean }

const revealedTranslations = new Set<string>();

export function renderVerses(pageNumbers: number[], options: VerseOptions): HTMLElement {
  const root = h('div', { class: 'verses' });
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
  root.append(h('p', { class: 'verses-source' }, `Translation: ${TRANSLATION_NAME}.`));
  return root;
}

export function renderAyah(key: string, options: VerseOptions): HTMLElement {
  const article = h('article', { class: 'ayah', id: `ayah-${key.replace(':', '-')}` });
  article.dataset.key = key;
  const rerender = (focusJoint?: number) => {
    const next = renderAyah(key, options);
    article.replaceWith(next);
    if (focusJoint != null) next.querySelector<HTMLElement>(`.joint[data-after="${focusJoint}"]`)?.focus();
  };

  // --- heading: where, and whether the grouping is the suggestion or yours
  const suggestedNow = usesSuggestion(key);
  const status = h('span', { class: 'ayah-status' }, suggestedNow ? 'suggested grouping' : 'your grouping');
  const head = h('header', { class: 'ayah-head' }, h('span', { class: 'ayah-num' }, ayahLabel(key)), status);
  if (!suggestedNow) {
    const reset = h('button', { type: 'button', class: 'ayah-reset' }, 'use suggestion');
    reset.addEventListener('click', () => { resetToSuggested(key); rerender(); });
    head.append(reset);
  }

  // --- the ayah itself, phrase by phrase, with a tap spot between every two words
  const phrases = phrasesOf(key);
  const glyphs = ayahGlyphs(key);
  const text = h('div', { class: 'ayah-text', dir: 'rtl', lang: 'ar' });
  const lastWord = glyphs.filter((g) => g.word.type === 'word').length - 1;
  for (const { page, word } of glyphs) {
    const span = h('span', { class: word.type === 'end' ? 'vw end' : 'vw' }, word.uthmani);
    span.dataset.page = String(page);
    span.dataset.code = word.code;
    text.append(span);
    const i = word.pos - 1;
    if (word.type !== 'word' || i >= lastWord) continue;
    const split = phrases.some((p) => p.end === i);
    const joint = h('button', {
      type: 'button',
      class: split ? 'joint split' : 'joint',
      'aria-pressed': String(split),
      'aria-label': split ? `Join the phrases at word ${i + 1}` : `Split after word ${i + 1}`,
      title: split ? 'Join' : 'Split here',
    }) as HTMLButtonElement;
    joint.dataset.after = String(i);
    joint.addEventListener('click', () => { toggleBreak(key, i); rerender(i); });
    joint.addEventListener('keydown', (e) => {
      // Right to left: the left arrow moves on through the ayah.
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      article.querySelector<HTMLElement>(`.joint[data-after="${i + step}"]`)?.focus();
    });
    text.append(joint);
  }
  // Keep the ayah marker on the same line as the last word.
  const marker = text.querySelector('.vw.end');
  if (marker?.previousElementSibling) {
    const tie = h('span', { class: 'tie' });
    marker.previousElementSibling.before(tie);
    tie.append(marker.previousElementSibling, marker);
  }
  upgradeGlyphs(text);

  // --- translation, optionally covered for recall
  const translation = translationOf(key) ?? 'No translation saved for this ayah yet.';
  let tr: HTMLElement;
  if (options.coverTranslations && !revealedTranslations.has(key)) {
    tr = h('button', { type: 'button', class: 'ayah-cover' }, 'Translation hidden. Tap to check yourself.');
    tr.addEventListener('click', () => { revealedTranslations.add(key); rerender(); });
  } else {
    tr = h('p', { class: 'ayah-translation' }, translation);
    if (options.coverTranslations) {
      tr.classList.add('tappable');
      tr.addEventListener('click', () => { revealedTranslations.delete(key); rerender(); });
    }
  }

  // --- your meaning and note for each phrase, tucked away until wanted
  const written = phrases.filter((p) => p.meaning || p.note).length;
  const details = h('details', { class: 'ayah-phrases' },
    h('summary', {}, `Your phrase notes${written ? ` (${written} of ${phrases.length})` : ''}`));
  const words = glyphs.filter((g) => g.word.type === 'word').map((g) => g.word.uthmani);
  for (const p of phrases) {
    details.append(h('div', { class: 'phrase-row' },
      h('p', { class: 'phrase-arabic', dir: 'rtl', lang: 'ar' }, words.slice(p.start, p.end + 1).join(' ')),
      noteField('Meaning', `v-meaning-${key}-${p.start}`, p.meaning, 'What this phrase means to you', (v) => updatePhrase(key, p.start, { meaning: v })),
      noteField('Note', `v-note-${key}-${p.start}`, p.note, 'Memorisation note', (v) => updatePhrase(key, p.start, { note: v })),
    ));
  }

  article.append(head, text, tr, details);
  return article;
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
    ensureFont(family, sample).then((ok) => { if (ok && container.isConnected) apply(); });
  }
}
