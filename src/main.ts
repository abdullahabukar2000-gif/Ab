// Bundled, not fetched from Google, so the app works with the wifi off.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/amiri-quran/arabic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { availablePages, getPage } from './data';
import { iconButton } from './icons';
import { renderPage, upgradeToGlyphs } from './render';
import { renderVerses, resetReveals } from './verses';

type View = 'mushaf' | 'verses';
type Layout = 'single' | 'spread';

const stage = document.querySelector<HTMLElement>('#stage')!;
const viewButton = document.querySelector<HTMLButtonElement>('#view')!;
const layoutButton = document.querySelector<HTMLButtonElement>('#layout')!;
const coverButton = document.querySelector<HTMLButtonElement>('#cover')!;
const nextButton = document.querySelector<HTMLButtonElement>('#next')!;
const prevButton = document.querySelector<HTMLButtonElement>('#prev')!;

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

let view: View = store.get('view') === 'verses' ? 'verses' : 'mushaf';
let layout: Layout = store.get('layout') === 'spread' ? 'spread' : 'single';
let coverTranslations = store.get('cover') === 'yes';

iconButton(nextButton, 'chevronLeft', 'next');
iconButton(prevButton, 'chevronRight', 'previous');

/** Pages grouped as they sit on screen: one per slot, or an odd (right) and even (left) pair. */
function slotsOf(): number[][] {
  if (layout === 'single') return availablePages.map((n) => [n]);
  const slots: number[][] = [];
  for (const n of availablePages) {
    const right = n % 2 ? n : n - 1;
    const last = slots[slots.length - 1];
    if (last && last[0] === right) last.push(n);
    else slots.push([n]);
  }
  return slots;
}

function show(): void {
  stage.dataset.view = view;
  stage.dataset.layout = layout;
  document.body.dataset.view = view;
  iconButton(viewButton, view === 'mushaf' ? 'rows' : 'book', view === 'mushaf' ? 'verse by verse' : 'mushaf');
  iconButton(layoutButton, layout === 'single' ? 'twoPages' : 'onePage', layout === 'single' ? 'two pages' : 'one page');
  iconButton(coverButton, coverTranslations ? 'eye' : 'eyeOff', coverTranslations ? 'show translations' : 'hide translations');

  if (view === 'verses') {
    stage.replaceChildren(renderVerses(availablePages, { coverTranslations }));
    return;
  }
  // The mushaf, swiped sideways: laid out right to left, so the first page
  // sits at the right and the next one comes in from the left, as in print.
  stage.replaceChildren(...slotsOf().map((pages) => {
    const slot = document.createElement('section');
    slot.className = 'slot';
    slot.dataset.page = String(pages[0]);
    slot.dataset.pages = pages.join(',');
    const spread = document.createElement('div');
    spread.className = 'spread';
    spread.dir = 'rtl';
    for (const n of pages) {
      const data = getPage(n)!;
      const pageEl = renderPage(data);
      spread.append(pageEl);
      queueMicrotask(() => upgradeToGlyphs(pageEl, data));
    }
    slot.append(spread);
    return slot;
  }));
}

/** The page you're looking at: the slot filling the screen, or the page heading nearest the top. */
function pageInView(): number {
  const box = stage.getBoundingClientRect();
  if (view === 'mushaf') {
    let best = availablePages[0];
    let bestDistance = Infinity;
    for (const slot of stage.querySelectorAll<HTMLElement>('.slot')) {
      const d = Math.abs(slot.getBoundingClientRect().left - box.left);
      if (d < bestDistance) { bestDistance = d; best = Number(slot.dataset.page); }
    }
    return best;
  }
  let current = availablePages[0];
  for (const el of stage.querySelectorAll<HTMLElement>('.verses-page')) {
    if (el.getBoundingClientRect().top <= box.top + stage.clientHeight / 3) current = Number(el.dataset.page);
  }
  return current;
}

function scrollToPage(page: number, smooth = false): void {
  const behavior = smooth ? 'smooth' : 'instant';
  const box = stage.getBoundingClientRect();
  if (view === 'mushaf') {
    const slot = [...stage.querySelectorAll<HTMLElement>('.slot')].find((s) => s.dataset.pages!.split(',').map(Number).includes(page));
    if (slot) stage.scrollBy({ left: slot.getBoundingClientRect().left - box.left, behavior });
  } else {
    const heading = stage.querySelector<HTMLElement>(`.verses-page[data-page="${page}"]`);
    if (heading) stage.scrollBy({ top: heading.getBoundingClientRect().top - box.top, behavior });
  }
}

/** Move one slot on (1) or back (-1). */
function turn(direction: 1 | -1): void {
  const slots = slotsOf();
  const at = slots.findIndex((s) => s.includes(pageInView()));
  const next = slots[at + direction];
  if (next) scrollToPage(next[0], true);
}

function rebuildKeepingPlace(change: () => void): void {
  const page = pageInView();
  change();
  show();
  scrollToPage(page);
}

viewButton.addEventListener('click', () => rebuildKeepingPlace(() => {
  view = view === 'mushaf' ? 'verses' : 'mushaf';
  store.set('view', view);
}));
layoutButton.addEventListener('click', () => rebuildKeepingPlace(() => {
  layout = layout === 'single' ? 'spread' : 'single';
  store.set('layout', layout);
}));
coverButton.addEventListener('click', () => {
  const scroll = stage.scrollTop;
  coverTranslations = !coverTranslations;
  resetReveals();
  store.set('cover', coverTranslations ? 'yes' : 'no');
  show();
  stage.scrollTop = scroll;
});
nextButton.addEventListener('click', () => turn(1));
prevButton.addEventListener('click', () => turn(-1));

// Arrow keys turn pages in the mushaf; left is forward, as the mushaf reads right to left.
document.addEventListener('keydown', (e) => {
  if (view !== 'mushaf' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); turn(1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); turn(-1); }
});

show();
