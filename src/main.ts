// Bundled, not fetched from Google, so the app works with the wifi off.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/amiri-quran/arabic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { availablePages, getPage } from './data';
import { renderPage, upgradeToGlyphs } from './render';
import { renderVerses, resetReveals } from './verses';

type View = 'mushaf' | 'verses';

const stage = document.querySelector<HTMLElement>('#stage')!;
const viewButton = document.querySelector<HTMLButtonElement>('#view')!;
const coverButton = document.querySelector<HTMLButtonElement>('#cover')!;

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

let view: View = store.get('view') === 'verses' ? 'verses' : 'mushaf';
let coverTranslations = store.get('cover') === 'yes';

/**
 * Every added page, one after another: in the mushaf view each page fills
 * the screen and you scroll down through them; in verse by verse, every
 * ayah of those pages in order.
 */
function show(): void {
  stage.dataset.view = view;
  document.body.dataset.view = view;
  viewButton.textContent = view === 'mushaf' ? 'verse by verse' : 'mushaf page';
  coverButton.setAttribute('aria-pressed', String(coverTranslations));

  if (view === 'verses') {
    stage.replaceChildren(renderVerses(availablePages, { coverTranslations }));
    return;
  }
  const pages = availablePages.map((n) => {
    const data = getPage(n)!;
    const pageEl = renderPage(data);
    const slot = document.createElement('section');
    slot.className = 'slot';
    slot.dataset.page = String(n);
    const spread = document.createElement('div');
    spread.className = 'spread';
    spread.append(pageEl);
    slot.append(spread);
    queueMicrotask(() => upgradeToGlyphs(pageEl, data));
    return slot;
  });
  stage.replaceChildren(...pages);
}

/** The page at the top of the screen right now. */
function pageInView(): number {
  const top = stage.getBoundingClientRect().top + 8;
  const items = view === 'mushaf'
    ? [...stage.querySelectorAll<HTMLElement>('.slot')].map((el) => ({ el, page: Number(el.dataset.page) }))
    : [...stage.querySelectorAll<HTMLElement>('.verses-page')].map((el) => ({ el, page: Number(el.dataset.page) }));
  let current = items[0]?.page ?? availablePages[0];
  for (const { el, page } of items) if (el.getBoundingClientRect().top <= top + stage.clientHeight / 3) current = page;
  return current;
}

function scrollToPage(page: number): void {
  const target = view === 'mushaf'
    ? stage.querySelector<HTMLElement>(`.slot[data-page="${page}"]`)
    : stage.querySelector<HTMLElement>(`.verses-page[data-page="${page}"]`);
  if (target) stage.scrollTop += target.getBoundingClientRect().top - stage.getBoundingClientRect().top;
}

// Switching views keeps your place: the page you were on.
viewButton.addEventListener('click', () => {
  const page = pageInView();
  view = view === 'mushaf' ? 'verses' : 'mushaf';
  store.set('view', view);
  show();
  scrollToPage(page);
});

coverButton.addEventListener('click', () => {
  const scroll = stage.scrollTop;
  coverTranslations = !coverTranslations;
  resetReveals();
  store.set('cover', coverTranslations ? 'yes' : 'no');
  show();
  stage.scrollTop = scroll;
});

show();
