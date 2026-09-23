// Bundled, not fetched from Google, so the app works with the wifi off.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/amiri-quran/arabic-400.css';
import '@fontsource/scheherazade-new/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { availablePages, getChapter, getPage, loadIndex, loadPages, surahsOnPage, TOTAL_PAGES } from './data';
import { loadFontUrls } from './fonts';
import { iconButton, type IconName } from './icons';
import { renderPage, upgradeToGlyphs } from './render';
import { renderVerses, resetReveals } from './verses';
import { renderHome } from './home';
import { countText, renderSettings, scriptFamily, syncLine, type Mood, type Prefs, type Script } from './settings';
import { onChange } from './notes';
import { onSyncState, startSync } from './sync';

type View = 'home' | 'mushaf' | 'verses' | 'settings';
type Layout = 'single' | 'spread';

const stage = document.querySelector<HTMLElement>('#stage')!;
const title = document.querySelector<HTMLElement>('#title')!;
const subtitle = document.querySelector<HTMLElement>('#subtitle')!;
const layoutButton = document.querySelector<HTMLButtonElement>('#layout')!;
const coverButton = document.querySelector<HTMLButtonElement>('#cover')!;
const nextButton = document.querySelector<HTMLButtonElement>('#next')!;
const prevButton = document.querySelector<HTMLButtonElement>('#prev')!;
const tabs = document.querySelectorAll<HTMLButtonElement>('#tabs [data-view]');

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

const VIEWS: View[] = ['home', 'mushaf', 'verses', 'settings'];
let view: View = VIEWS.includes(store.get('view') as View) ? store.get('view') as View : 'home';
let layout: Layout = store.get('layout') === 'spread' ? 'spread' : 'single';
let coverTranslations = store.get('cover') === 'yes';
const savedPage = Number(store.get('page'));
let lastPage: number | null = savedPage >= 1 && savedPage <= TOTAL_PAGES ? savedPage : null;
const prefs: Prefs = {
  mood: (['auto', 'chalk', 'sepia', 'night'] as Mood[]).find((m) => m === store.get('mood')) ?? 'auto',
  script: (['mushaf', 'amiri', 'scheherazade', 'naskh'] as Script[]).find((s) => s === store.get('script')) ?? 'mushaf',
};

// ------------------------------------------------------------------ chrome

const TAB_ICONS: Record<View, [IconName, string]> = {
  home: ['home', 'Home'], mushaf: ['book', 'Mushaf'], verses: ['rows', 'Verse by verse'], settings: ['gear', 'Settings'],
};
tabs.forEach((t) => { const [i, l] = TAB_ICONS[t.dataset.view as View]; iconButton(t, i, l); });
iconButton(nextButton, 'chevronLeft', 'Next page');
iconButton(prevButton, 'chevronRight', 'Previous page');

function applyMood(): void {
  if (prefs.mood === 'auto') delete document.documentElement.dataset.mood;
  else document.documentElement.dataset.mood = prefs.mood;
}

function updateChrome(): void {
  document.body.dataset.view = view;
  stage.dataset.view = view;
  stage.dataset.layout = layout;
  tabs.forEach((t) => {
    if (t.dataset.view === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  iconButton(layoutButton, layout === 'single' ? 'twoPages' : 'onePage', layout === 'single' ? 'Two pages' : 'One page');
  iconButton(coverButton, coverTranslations ? 'eye' : 'eyeOff', coverTranslations ? 'Show translations' : 'Hide translations');
  updateTitle();
}

function updateTitle(): void {
  if (view === 'home') { title.textContent = 'Hifz Mushaf'; subtitle.textContent = 'حفظ'; subtitle.lang = 'ar'; return; }
  if (view === 'settings') { title.textContent = 'Settings'; subtitle.textContent = ''; return; }
  subtitle.lang = 'en';
  const page = pageInView();
  const shown = view === 'mushaf' && layout === 'spread' ? currentSlot() ?? [page] : [page];
  // Every surah on screen, as a page where one surah ends and the next begins holds both.
  const surahs = [...new Set(shown.flatMap(surahsOnPage))];
  title.textContent = surahs.map((id) => getChapter(id)?.name_complex ?? '').join(' · ');
  const pages = view === 'mushaf' && layout === 'spread' ? currentSlot()?.join('–') : String(page);
  subtitle.textContent = view === 'verses' ? `Verse by verse · page ${page}` : `Page ${pages}`;
}

// ------------------------------------------------------------------ views

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

/** Redraw the current view; mushaf and verse by verse open at `page`. */
function show(page = lastPage ?? 1): void {
  updateChrome();
  stage.scrollTop = 0;
  verseJob = null;
  if (view === 'home') {
    stage.replaceChildren(renderHome(lastPage, { openPage }));
    return;
  }
  if (view === 'settings') {
    // The script samples are real words from page 255, so it loads first.
    stage.replaceChildren();
    loadPages([255]).catch(() => undefined).then(() => {
      if (view === 'settings') stage.replaceChildren(renderSettings(prefs, changePrefs));
    });
    return;
  }
  if (view === 'verses') {
    const { root, ready } = renderVerses(page, { coverTranslations, arabicFamily: scriptFamily(prefs.script) });
    stage.replaceChildren(root);
    verseJob = ready;
    return;
  }
  // The mushaf, swiped sideways: laid out right to left, so the first page
  // sits at the right and the next one comes in from the left, as in print.
  // All 604 pages have a place, but only those near the screen are drawn.
  slotObserver?.disconnect();
  slotObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const slot = e.target as HTMLElement;
      if (e.isIntersecting) fillSlot(slot); else emptySlot(slot);
    }
  }, { root: stage, rootMargin: '0px 300%' });
  stage.replaceChildren(...slotsOf().map((pages) => {
    const slot = document.createElement('section');
    slot.className = 'slot';
    slot.dataset.page = String(pages[0]);
    slot.dataset.pages = pages.join(',');
    slotObserver!.observe(slot);
    return slot;
  }));
}

let slotObserver: IntersectionObserver | null = null;
let verseJob: Promise<void> | null = null;

function fillSlot(slot: HTMLElement): void {
  if (slot.dataset.filled) return;
  slot.dataset.filled = 'yes';
  const pages = slot.dataset.pages!.split(',').map(Number);
  loadPages(pages).then(() => {
    if (!slot.dataset.filled || slot.childElementCount) return;
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
  }).catch(() => {
    delete slot.dataset.filled;
    slot.replaceChildren(Object.assign(document.createElement('p'), { className: 'slot-error', textContent: 'This page couldn’t load. Swipe away and back to try again.' }));
  });
}

function emptySlot(slot: HTMLElement): void {
  delete slot.dataset.filled;
  slot.replaceChildren();
}

function currentSlot(): number[] | undefined {
  return slotsOf().find((s) => s.includes(pageInView()));
}

/** The page you're looking at: the slot filling the screen, or the page heading nearest the top. */
function pageInView(): number {
  const box = stage.getBoundingClientRect();
  if (view === 'mushaf') {
    // One slot per screen width; right to left, so scrollLeft counts down from 0.
    const slots = stage.children;
    const at = Math.round(Math.abs(stage.scrollLeft) / Math.max(1, stage.clientWidth));
    const slot = slots[Math.min(at, slots.length - 1)] as HTMLElement | undefined;
    return slot ? Number(slot.dataset.page) : lastPage ?? 1;
  }
  if (view === 'verses') {
    let current = lastPage ?? 1;
    for (const el of stage.querySelectorAll<HTMLElement>('.verses-page')) {
      if (el.getBoundingClientRect().top <= box.top + stage.clientHeight / 3) current = Number(el.dataset.page);
    }
    return current;
  }
  return lastPage ?? availablePages[0];
}

function scrollToPage(page: number, smooth = false): void {
  const behavior = smooth ? 'smooth' : 'instant';
  const box = stage.getBoundingClientRect();
  if (view === 'mushaf') {
    const slot = [...stage.querySelectorAll<HTMLElement>('.slot')].find((s) => s.dataset.pages!.split(',').map(Number).includes(page));
    if (slot && !smooth) fillSlot(slot);
    if (slot) {
      // Snap points stop a scroll at every page on the way; a jump should go straight there.
      if (!smooth) stage.style.scrollSnapType = 'none';
      stage.scrollBy({ left: slot.getBoundingClientRect().left - box.left, behavior });
      if (!smooth) requestAnimationFrame(() => { stage.style.scrollSnapType = ''; });
    }
  } else if (view === 'verses') {
    const heading = stage.querySelector<HTMLElement>(`.verses-page[data-page="${page}"]`);
    if (heading) stage.scrollBy({ top: heading.getBoundingClientRect().top - box.top, behavior });
  }
  remember();
}

/** Keep the page in view for "Continue reading", and the title in step with it. */
function remember(): void {
  if (view !== 'mushaf' && view !== 'verses') return;
  lastPage = pageInView();
  store.set('page', String(lastPage));
  updateTitle();
}
let scrollTimer: number | undefined;
stage.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = window.setTimeout(remember, 150); }, { passive: true });

function go(next: View, page?: number): void {
  const keep = page ?? (view === 'mushaf' || view === 'verses' ? pageInView() : lastPage ?? 1);
  view = next;
  store.set('view', view);
  show(keep);
  if (next === 'mushaf') scrollToPage(keep);
  if (next === 'verses') verseJob?.then(() => { if (view === 'verses') scrollToPage(keep); });
}

/** Redraw in place: the same page stays in view. */
function refresh(): void {
  if (view === 'mushaf' || view === 'verses') { go(view, pageInView()); return; }
  const scroll = stage.scrollTop;
  show();
  stage.scrollTop = scroll;
}

function openPage(page: number, target: 'mushaf' | 'verses'): void { go(target, page); }

function changePrefs(p: Partial<Prefs>): void {
  Object.assign(prefs, p);
  store.set('mood', prefs.mood);
  store.set('script', prefs.script);
  applyMood();
  refresh();
}

/** Move one slot on (1) or back (-1). */
function turn(direction: 1 | -1): void {
  const slots = slotsOf();
  const at = slots.findIndex((s) => s.includes(pageInView()));
  const next = slots[at + direction];
  if (next) scrollToPage(next[0], true);
}

// ------------------------------------------------------------------ wiring

tabs.forEach((t) => t.addEventListener('click', () => { if (t.dataset.view !== view) go(t.dataset.view as View); }));
layoutButton.addEventListener('click', () => {
  const page = pageInView();
  layout = layout === 'single' ? 'spread' : 'single';
  store.set('layout', layout);
  go('mushaf', page);
});
coverButton.addEventListener('click', () => {
  coverTranslations = !coverTranslations;
  resetReveals();
  store.set('cover', coverTranslations ? 'yes' : 'no');
  refresh();
});
nextButton.addEventListener('click', () => turn(1));
prevButton.addEventListener('click', () => turn(-1));

// Arrow keys turn pages in the mushaf; left is forward, as the mushaf reads right to left.
document.addEventListener('keydown', (e) => {
  if (view !== 'mushaf' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); turn(1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); turn(-1); }
});

// Groups changed on another device arrive here; redraw what shows them.
onChange((key) => {
  if (key !== '*') return;
  if (view === 'settings') {
    const line = stage.querySelector('.work-count');
    if (line) line.textContent = countText();
    return;
  }
  if (view === 'verses') refresh();
});
onSyncState(() => {
  if (view !== 'settings') return;
  const line = stage.querySelector('.sync-line');
  if (line) line.replaceWith(syncLine());
});

applyMood();
updateChrome();
// The small page index and the font list come first; pages load as they're reached.
Promise.all([loadIndex(), loadFontUrls()]).then(() => {
  go(view);
  startSync();
}).catch(() => {
  stage.textContent = 'The Quran pages couldn’t load. Check your connection and reload.';
});
