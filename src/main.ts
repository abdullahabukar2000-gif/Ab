// Bundled, not fetched from Google, so the app works with the wifi off.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/amiri-quran/arabic-400.css';
import '@fontsource/scheherazade-new/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { availablePages, getChapter, getPage } from './data';
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
let lastPage: number | null = availablePages.includes(Number(store.get('page'))) ? Number(store.get('page')) : null;
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
  const data = getPage(page);
  // Every surah on the page, as a page where one surah ends and the next begins holds both.
  const surahs = data ? [...new Set(data.verses.map((k) => Number(k.split(':')[0])))] : [];
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

function show(): void {
  updateChrome();
  stage.scrollTop = 0;
  if (view === 'home') {
    stage.replaceChildren(renderHome(lastPage, { openPage }));
    return;
  }
  if (view === 'settings') {
    stage.replaceChildren(renderSettings(prefs, changePrefs));
    return;
  }
  if (view === 'verses') {
    stage.replaceChildren(renderVerses(availablePages, { coverTranslations, arabicFamily: scriptFamily(prefs.script) }));
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

function currentSlot(): number[] | undefined {
  return slotsOf().find((s) => s.includes(pageInView()));
}

/** The page you're looking at: the slot filling the screen, or the page heading nearest the top. */
function pageInView(): number {
  const box = stage.getBoundingClientRect();
  if (view === 'mushaf') {
    let best = lastPage ?? availablePages[0];
    let bestDistance = Infinity;
    for (const slot of stage.querySelectorAll<HTMLElement>('.slot')) {
      const d = Math.abs(slot.getBoundingClientRect().left - box.left);
      if (d < bestDistance) { bestDistance = d; best = Number(slot.dataset.page); }
    }
    return best;
  }
  if (view === 'verses') {
    let current = availablePages[0];
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
  const keep = page ?? (view === 'mushaf' || view === 'verses' ? pageInView() : lastPage ?? availablePages[0]);
  view = next;
  store.set('view', view);
  show();
  if (next === 'mushaf' || next === 'verses') scrollToPage(keep);
}

function openPage(page: number, target: 'mushaf' | 'verses'): void { go(target, page); }

function changePrefs(p: Partial<Prefs>): void {
  Object.assign(prefs, p);
  store.set('mood', prefs.mood);
  store.set('script', prefs.script);
  applyMood();
  const scroll = stage.scrollTop;
  show();
  stage.scrollTop = scroll;
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
  if (view === 'verses') {
    const scroll = stage.scrollTop;
    show();
    stage.scrollTop = scroll;
  }
});
onSyncState(() => {
  if (view !== 'settings') return;
  const line = stage.querySelector('.sync-line');
  if (line) line.replaceWith(syncLine());
});

applyMood();
go(view);
startSync();
