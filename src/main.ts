// Bundled, not fetched from Google, so the app works with the wifi off.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/amiri-quran/arabic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { availablePages, getPage } from './data';
import { ensureFont, pageFamily } from './fonts';
import { renderPage, upgradeToGlyphs } from './render';
import { paintMarks, type Selection } from './marks';
import { onChange, phraseAt, wordCount } from './notes';
import { renderPanel } from './panel';
import { renderVerses, resetReveals } from './verses';

type Layout = 'single' | 'spread';

const stage = document.querySelector<HTMLElement>('#stage')!;
const controls = document.querySelector<HTMLElement>('#controls')!;
const forward = document.querySelector<HTMLButtonElement>('#forward')!;
const back = document.querySelector<HTMLButtonElement>('#back')!;
const where = document.querySelector<HTMLElement>('#where')!;
const layoutButtons = document.querySelectorAll<HTMLButtonElement>('[data-layout]');
const panel = document.querySelector<HTMLElement>('#panel')!;
const viewButton = document.querySelector<HTMLButtonElement>('#view')!;
const coverButton = document.querySelector<HTMLButtonElement>('#cover')!;

const first = availablePages[0];
const last = availablePages[availablePages.length - 1];

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

let layout: Layout = store.get('layout') === 'spread' ? 'spread' : 'single';
type View = 'mushaf' | 'verses';
let view: View = store.get('view') === 'verses' ? 'verses' : 'mushaf';
let coverTranslations = store.get('cover') === 'yes';
let current = initialPage();
let selection: Selection | null = null;
let revealed = false;

function initialPage(): number {
  const fromHash = Number(location.hash.slice(1));
  if (availablePages.includes(fromHash)) return fromHash;
  const saved = Number(store.get('page'));
  return availablePages.includes(saved) ? saved : availablePages.includes(258) ? 258 : first;
}

/** Pages on screen, in reading order. A spread is an odd (right) page and the even page after it. */
function visiblePages(): number[] {
  if (layout === 'single') return [current];
  const right = current % 2 ? current : current - 1;
  return [right, right + 1].filter((p) => getPage(p));
}

function show(scrollTo?: string): void {
  const pages = visiblePages();
  stage.dataset.layout = layout;
  stage.dataset.view = view;
  document.body.dataset.view = view;
  viewButton.textContent = view === 'mushaf' ? 'verse by verse' : 'mushaf page';
  coverButton.setAttribute('aria-pressed', String(coverTranslations));
  if (view === 'verses') {
    stage.replaceChildren(renderVerses(pages, { coverTranslations }));
    const target = scrollTo && document.getElementById(`ayah-${scrollTo.replace(':', '-')}`);
    if (target) target.scrollIntoView({ block: 'start' }); else stage.scrollTop = 0;
    afterShow(pages);
    return;
  }
  const spread = document.createElement('div');
  spread.className = 'spread';
  spread.dir = 'rtl'; // first child (the odd page) sits on the right
  for (const n of pages) {
    const data = getPage(n)!;
    const pageEl = renderPage(data);
    spread.append(pageEl);
    queueMicrotask(async () => { await upgradeToGlyphs(pageEl, data); paintMarks(pageEl, selection); });
  }
  stage.replaceChildren(spread);
  placePanel();
  afterShow(pages);
}

function afterShow(pages: number[]): void {
  where.textContent = pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0]);
  forward.disabled = pages[pages.length - 1] >= last;
  back.disabled = pages[0] <= first;
  layoutButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === layout)));
  try { history.replaceState(null, '', `#${current}`); } catch { /* sandboxed frame */ }
  store.set('page', String(current));
  prefetch(pages[pages.length - 1] + 1);
  prefetch(pages[0] - 1);
}

function prefetch(n: number): void {
  const data = getPage(n);
  if (data) ensureFont(pageFamily(n), data.lines.flatMap((l) => l.words.map((w) => w.code)).join(''));
}

function turn(direction: 1 | -1): void {
  const step = layout === 'spread' ? 2 : 1;
  let next = current + direction * step;
  if (layout === 'spread') next = next % 2 ? next : next - 1;
  next = Math.min(last, Math.max(first, next));
  if (next === current || !getPage(next)) return;
  current = next;
  select(null);
  show();
}

/** Switch views without losing your place: the selected ayah, else the page. */
function setView(next: View, focusKey?: string): void {
  const key = focusKey ?? selection?.verseKey;
  view = next;
  store.set('view', next);
  if (next === 'verses') { panel.classList.remove('open'); show(key); }
  else { show(); select(selection); }
}

function setLayout(next: Layout): void {
  layout = next;
  store.set('layout', next);
  show();
}

// The mushaf reads right to left, so the next page is to the left.
forward.addEventListener('click', () => turn(1));
back.addEventListener('click', () => turn(-1));
layoutButtons.forEach((b) => b.addEventListener('click', () => setLayout(b.dataset.layout as Layout)));
viewButton.addEventListener('click', () => setView(view === 'mushaf' ? 'verses' : 'mushaf'));
coverButton.addEventListener('click', () => {
  coverTranslations = !coverTranslations;
  resetReveals();
  store.set('cover', coverTranslations ? 'yes' : 'no');
  show();
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest('#panel, #controls, .verses button, .verses textarea, .verses summary')) return;
  if (e.key === 'Escape') { select(null); return; }
  if (e.key === 'ArrowLeft') turn(1);
  else if (e.key === 'ArrowRight') turn(-1);
});

// Swipe like turning a paper mushaf: drawing the left-hand page across to
// the right brings the next page.
let touchX: number | null = null;
stage.addEventListener('touchstart', (e) => { touchX = view === 'mushaf' ? e.touches[0].clientX : null; }, { passive: true });
stage.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) turn(dx > 0 ? 1 : -1);
});

// ------------------------------------------------------------------ phrases

function repaint(): void {
  stage.querySelectorAll<HTMLElement>('.page').forEach((p) => paintMarks(p, selection));
}

function select(next: Selection | null): void {
  selection = next;
  if (!next) revealed = false;
  repaint();
  if (view !== 'mushaf') return;
  renderPanel(panel, selection && { selection, revealed }, {
    select: choose,
    toggleReveal,
    editGroups: (key) => setView('verses', key),
  });
}

/** Choosing a different phrase starts it covered, like turning up a new card. */
function choose(next: Selection | null): void {
  if (next && (next.verseKey !== selection?.verseKey || next.start !== selection?.start)) revealed = false;
  select(next);
}

function toggleReveal(): void {
  revealed = !revealed;
  select(selection);
}

stage.addEventListener('click', (e) => {
  if (view !== 'mushaf') return;
  const word = (e.target as HTMLElement).closest<HTMLElement>('.page[data-glyphs="ready"] .w');
  if (!word) { select(null); return; }
  const key = word.dataset.key!;
  // The ayah marker belongs to the ayah's last phrase.
  const index = Math.min(Number(word.dataset.pos) - 1, wordCount(key) - 1);
  const phrase = phraseAt(key, index)!;
  if (selection?.verseKey === key && selection.start === phrase.start) toggleReveal();
  else choose({ verseKey: key, start: phrase.start });
});

onChange(() => { if (view === 'mushaf') repaint(); });

/** Margin beside the page when there's room for it, a sheet along the bottom when not. */
function placePanel(): void {
  const spread = stage.querySelector<HTMLElement>('.spread');
  if (!spread) return;
  const free = (stage.clientWidth - spread.getBoundingClientRect().width) / 2;
  document.body.dataset.panel = free >= 300 ? 'margin' : 'sheet';
  document.body.style.setProperty('--margin-free', `${Math.max(0, free)}px`);
  // The sheet takes only the room below the page, so it never covers a line;
  // on very short screens it gets a usable minimum and scrolls.
  const below = window.innerHeight - spread.getBoundingClientRect().bottom;
  document.body.style.setProperty('--sheet-max', `${Math.max(180, below)}px`);
}

new ResizeObserver(() => { placePanel(); repaint(); }).observe(stage);

addEventListener('hashchange', () => {
  const n = Number(location.hash.slice(1));
  if (availablePages.includes(n) && n !== current) { current = n; select(null); show(); }
});

show();
