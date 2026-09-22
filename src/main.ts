// Bundled, not fetched from Google, so the app works with the wifi off.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/amiri-quran/arabic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { availablePages, getPage } from './data';
import { ensureFont, pageFamily } from './fonts';
import { renderPage, upgradeToGlyphs } from './render';

type Layout = 'single' | 'spread';

const stage = document.querySelector<HTMLElement>('#stage')!;
const controls = document.querySelector<HTMLElement>('#controls')!;
const forward = document.querySelector<HTMLButtonElement>('#forward')!;
const back = document.querySelector<HTMLButtonElement>('#back')!;
const where = document.querySelector<HTMLElement>('#where')!;
const layoutButtons = document.querySelectorAll<HTMLButtonElement>('[data-layout]');

const first = availablePages[0];
const last = availablePages[availablePages.length - 1];

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

let layout: Layout = store.get('layout') === 'spread' ? 'spread' : 'single';
let current = initialPage();

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

function show(): void {
  const pages = visiblePages();
  stage.dataset.layout = layout;
  const spread = document.createElement('div');
  spread.className = 'spread';
  spread.dir = 'rtl'; // first child (the odd page) sits on the right
  for (const n of pages) {
    const data = getPage(n)!;
    const pageEl = renderPage(data);
    spread.append(pageEl);
    queueMicrotask(() => upgradeToGlyphs(pageEl, data));
  }
  stage.replaceChildren(spread);

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
  show();
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

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') { turn(1); wake(); }
  else if (e.key === 'ArrowRight') { turn(-1); wake(); }
});

// Swipe like turning a paper mushaf: drawing the left-hand page across to
// the right brings the next page.
let touchX: number | null = null;
stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
stage.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) turn(dx > 0 ? 1 : -1);
});

// Controls sit almost invisible until there's intent to use them.
let idle: number | undefined;
function wake(): void {
  controls.classList.add('awake');
  clearTimeout(idle);
  idle = window.setTimeout(() => { if (!controls.matches(':focus-within, :hover')) controls.classList.remove('awake'); }, 2400);
}
document.addEventListener('pointermove', wake, { passive: true });
document.addEventListener('pointerdown', wake, { passive: true });
controls.addEventListener('focusin', wake);

addEventListener('hashchange', () => {
  const n = Number(location.hash.slice(1));
  if (availablePages.includes(n) && n !== current) { current = n; show(); }
});

show();
wake();
