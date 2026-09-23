// The phrase panel on the mushaf page: in the margin beside the page on wide
// screens, a sheet below the page on narrow ones. Never over the text.

import { ayahWords, getChapter, phraseGloss, TRANSLATION_NAME, translationOf } from './data';
import { phrasesOf, updatePhrase, type Phrase } from './notes';
import type { Selection } from './marks';

export interface PanelState { selection: Selection; revealed: boolean }

interface Actions {
  select(selection: Selection | null): void;
  toggleReveal(): void;
  editGroups(verseKey: string): void;
}

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v; else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
};

export const ayahLabel = (key: string) => {
  const [surah, ayah] = key.split(':');
  return `${getChapter(Number(surah))?.name_complex ?? `Surah ${surah}`} ${ayah}`;
};

export function renderPanel(root: HTMLElement, state: PanelState | null, actions: Actions): void {
  if (!state) { root.classList.remove('open'); return; }
  const { verseKey } = state.selection;
  const phrases = phrasesOf(verseKey);
  const phrase = phrases.find((p) => p.start === state.selection.start) ?? phrases[0];
  const words = ayahWords(verseKey);

  const title = h('p', { class: 'panel-where' }, ayahLabel(verseKey),
    phrases.length > 1 ? h('span', { class: 'panel-count' }, ` · phrase ${phrase.index + 1} of ${phrases.length}`) : '');
  const close = h('button', { class: 'panel-close', type: 'button' }, 'close');
  close.addEventListener('click', () => actions.select(null));

  const edit = h('button', { class: 'panel-action', type: 'button' }, 'Change how this ayah is grouped →');
  edit.addEventListener('click', () => actions.editGroups(verseKey));

  root.replaceChildren(
    h('div', { class: 'panel-head' }, title, close),
    h('p', { class: 'panel-arabic', lang: 'ar', dir: 'rtl' }, words.slice(phrase.start, phrase.end + 1).join(' ')),
    flashcard(verseKey, phrase, state.revealed, actions),
    noteField('Note', `note-${verseKey}-${phrase.start}`, phrase.note, 'Your memorisation note',
      (v) => updatePhrase(verseKey, phrase.start, { note: v })),
    edit,
  );
  root.classList.add('open');
}

/** Covered until the phrase is tapped again: the ayah's translation and your own meaning. */
function flashcard(key: string, phrase: Phrase, revealed: boolean, actions: Actions): HTMLElement {
  if (!revealed) {
    const cover = h('button', { class: 'panel-cover', type: 'button' }, 'Meaning hidden. Tap the phrase again, or here, to check yourself.');
    cover.addEventListener('click', actions.toggleReveal);
    return cover;
  }
  const hide = h('button', { class: 'panel-link', type: 'button' }, 'hide');
  hide.addEventListener('click', actions.toggleReveal);
  const text = translationOf(key);
  const gloss = phraseGloss(key, phrase.start, phrase.end);
  return h('div', { class: 'panel-revealed' },
    h('div', { class: 'panel-field' },
      h('span', { class: 'panel-label' }, 'This phrase, word by word ', hide),
      h('p', { class: 'panel-gloss' }, gloss ?? 'No word-by-word English saved for this ayah yet.')),
    h('div', { class: 'panel-field' },
      h('span', { class: 'panel-label' }, 'The whole ayah'),
      h('p', { class: 'panel-translation' }, text ?? 'No translation saved for this ayah yet.'),
      h('span', { class: 'panel-source' }, TRANSLATION_NAME)),
    noteField('Your meaning of this phrase', `meaning-${key}-${phrase.start}`, phrase.meaning, 'Write what this phrase means to you',
      (v) => updatePhrase(key, phrase.start, { meaning: v })));
}

export function noteField(label: string, id: string, value: string, placeholder: string, save: (v: string) => void): HTMLElement {
  const area = h('textarea', { id, rows: '1', placeholder }) as HTMLTextAreaElement;
  area.value = value;
  const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; };
  area.addEventListener('input', fit);
  // Save on blur, no Save button.
  area.addEventListener('blur', () => { if (area.value !== value) { value = area.value; save(area.value); } });
  requestAnimationFrame(fit);
  return h('div', { class: 'panel-field' }, h('label', { class: 'panel-label', for: id }, label), area);
}
