// The phrase panel: in the margin beside the page on wide screens, a sheet
// along the bottom on narrow ones. Never over the page.

import { ayahWords, getChapter } from './data';
import { getNote, phrasesOf, TONES, toggleBreak, updatePhrase, type Phrase } from './notes';
import type { Selection } from './marks';

export interface PanelState { selection: Selection; revealed: boolean }

interface Actions {
  select(selection: Selection | null): void;
  toggleReveal(): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v; else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
};

export function renderPanel(root: HTMLElement, state: PanelState | null, actions: Actions): void {
  if (!state) {
    root.classList.remove('open');
    return;
  }
  const { verseKey } = state.selection;
  const phrases = phrasesOf(verseKey);
  const phrase = phrases.find((p) => p.start === state.selection.start) ?? phrases[0];
  const words = ayahWords(verseKey);
  const note = getNote(verseKey);
  const [surah, ayah] = verseKey.split(':');
  const cut = phrases.length > 1;

  const title = h('p', { class: 'panel-where' },
    `${getChapter(Number(surah))?.name_complex ?? `Surah ${surah}`} ${ayah}`,
    cut ? h('span', { class: 'panel-count' }, ` · phrase ${phrase.index + 1} of ${phrases.length}`) : '',
    note?.example ? h('span', { class: 'panel-example' }, 'example') : '');

  const close = h('button', { class: 'panel-close', type: 'button', 'aria-label': 'Close' }, 'close');
  close.addEventListener('click', () => actions.select(null));

  const arabic = h('p', { class: 'panel-arabic', lang: 'ar', dir: 'rtl' }, words.slice(phrase.start, phrase.end + 1).join(' '));
  arabic.style.setProperty('--tone', `var(--tone-${phrase.tone})`);

  root.replaceChildren(
    h('div', { class: 'panel-head' }, title, close),
    arabic,
    meaningCard(verseKey, phrase, state.revealed, actions),
    textField('Note', 'panel-note', phrase.note, 'Your memorisation note', (v) => updatePhrase(verseKey, phrase.start, { note: v })),
    tonePicker(verseKey, phrase, () => renderPanel(root, state, actions)),
    splitter(verseKey, words, phrases, phrase, (sel) => actions.select(sel)),
  );
  root.classList.add('open');
}

/** Flashcard: the meaning stays covered until the phrase is tapped again. */
function meaningCard(key: string, phrase: Phrase, revealed: boolean, actions: Actions): HTMLElement {
  if (!revealed) {
    const cover = h('button', { class: 'panel-cover', type: 'button' }, 'Meaning hidden. Tap the phrase again, or here, to check yourself.');
    cover.addEventListener('click', actions.toggleReveal);
    return h('div', { class: 'panel-field' }, h('span', { class: 'panel-label' }, 'Meaning'), cover);
  }
  const field = textField('Meaning', 'panel-meaning', phrase.meaning, 'Write what this phrase means', (v) => updatePhrase(key, phrase.start, { meaning: v }));
  const hide = h('button', { class: 'panel-link', type: 'button' }, 'hide');
  hide.addEventListener('click', actions.toggleReveal);
  field.querySelector('.panel-label')!.append(' ', hide);
  return field;
}

function textField(label: string, id: string, value: string, placeholder: string, save: (v: string) => void): HTMLElement {
  const area = h('textarea', { id, rows: '2', placeholder }) as HTMLTextAreaElement;
  area.value = value;
  const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; };
  area.addEventListener('input', fit);
  // Save on blur, no Save button.
  area.addEventListener('blur', () => { if (area.value !== value) { value = area.value; save(area.value); } });
  requestAnimationFrame(fit);
  return h('div', { class: 'panel-field' }, h('label', { class: 'panel-label', for: id }, label), area);
}

function tonePicker(key: string, phrase: Phrase, rerender: () => void): HTMLElement {
  const row = h('div', { class: 'panel-tones', role: 'radiogroup', 'aria-label': 'Phrase colour' });
  for (const tone of TONES) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(tone === phrase.tone), 'aria-label': tone, title: tone });
    b.style.setProperty('--tone', `var(--tone-${tone})`);
    b.addEventListener('click', () => { updatePhrase(key, phrase.start, { tone }); rerender(); });
    row.append(b);
  }
  return h('div', { class: 'panel-field' }, h('span', { class: 'panel-label' }, 'Colour'), row);
}

/**
 * The ayah word by word, with a boundary between each pair of words: tap one
 * to cut the phrase there or join it back. Arrow keys move between
 * boundaries, space toggles.
 */
function splitter(key: string, words: string[], phrases: Phrase[], current: Phrase, select: (s: Selection) => void): HTMLElement {
  const row = h('div', { class: 'panel-split', lang: 'ar', dir: 'rtl' });
  const cuts: HTMLButtonElement[] = [];
  words.forEach((word, i) => {
    const phrase = phrases.find((p) => i >= p.start && i <= p.end)!;
    const w = h('button', { type: 'button', class: `split-word${phrase.start === current.start ? ' current' : ''}` }, word);
    w.style.setProperty('--tone', `var(--tone-${phrase.tone})`);
    w.addEventListener('click', () => select({ verseKey: key, start: phrase.start }));
    row.append(w);
    if (i === words.length - 1) return;
    const isBreak = phrases.some((p) => p.end === i);
    const cut = h('button', { type: 'button', class: `split-cut${isBreak ? ' on' : ''}`, 'aria-pressed': String(isBreak), 'aria-label': `${isBreak ? 'Join' : 'Split'} after word ${i + 1}` }) as HTMLButtonElement;
    cut.addEventListener('click', () => {
      toggleBreak(key, i);
      // Keep hold of the phrase that contains the word just before the boundary.
      const now = phrasesOf(key).find((p) => i >= p.start && i <= p.end)!;
      select({ verseKey: key, start: now.start });
      requestAnimationFrame(() => document.querySelectorAll<HTMLButtonElement>('.split-cut')[cuts.indexOf(cut)]?.focus());
    });
    cut.addEventListener('keydown', (e) => {
      const at = cuts.indexOf(cut);
      // Right to left: the left arrow moves on through the ayah.
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (step) { e.preventDefault(); cuts[at + step]?.focus(); }
    });
    cuts.push(cut);
    row.append(cut);
  });
  return h('div', { class: 'panel-field' },
    h('span', { class: 'panel-label' }, 'Phrases', h('span', { class: 'panel-hint' }, ' tap between two words to split or join')),
    row);
}
