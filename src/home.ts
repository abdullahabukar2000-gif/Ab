// Home: pick up where you left off, or choose a surah. Every surah is listed,
// as in a Quran app; those with pages added open straight to their first page.

import { allChapters, getChapter, getPage, surahCoverage, surahOfPage } from './data';
import { h } from './dom';
import { icon } from './icons';

export interface HomeActions {
  openPage(page: number, view: 'mushaf' | 'verses'): void;
}

let query = '';

export function renderHome(lastPage: number | null, actions: HomeActions): HTMLElement {
  const root = h('div', { class: 'home' });

  // --- continue reading
  const last = lastPage != null && getPage(lastPage) ? lastPage : null;
  if (last != null) {
    const chapter = surahOfPage(getPage(last)!);
    const verses = getPage(last)!.verses;
    const card = h('section', { class: 'continue' },
      h('p', { class: 'continue-label' }, 'Continue reading'),
      h('p', { class: 'continue-surah' }, chapter?.name_complex ?? ''),
      h('p', { class: 'continue-where' }, `Page ${last} · ${verses[0]}–${verses[verses.length - 1].split(':')[1]}`),
      h('p', { class: 'continue-arabic', lang: 'ar', dir: 'rtl' }, chapter ? `سورة ${chapter.name_arabic}` : ''));
    // A faint eight-pointed star, the surah marker, as the card's one ornament.
    card.insertAdjacentHTML('beforeend', '<svg class="continue-star" viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="8" width="24" height="24" rx="2"/><rect x="8" y="8" width="24" height="24" rx="2" transform="rotate(45 20 20)"/></svg>');
    const row = h('div', { class: 'continue-actions' });
    const mushaf = h('button', { type: 'button', class: 'on-crimson' });
    mushaf.innerHTML = `${icon('book')}<span class="label">Mushaf</span>`;
    mushaf.addEventListener('click', () => actions.openPage(last, 'mushaf'));
    const verseBtn = h('button', { type: 'button', class: 'on-crimson ghost' });
    verseBtn.innerHTML = `${icon('rows')}<span class="label">Verse by verse</span>`;
    verseBtn.addEventListener('click', () => actions.openPage(last, 'verses'));
    row.append(mushaf, verseBtn);
    card.append(row);
    root.append(card);
  }

  // --- the surahs with pages added, first
  const added = allChapters().filter((c) => surahCoverage(c.id).pages.length);
  if (added.length) {
    root.append(h('h2', { class: 'home-heading' }, 'Your surahs'),
      h('ol', { class: 'surahs' }, ...added.map((c) => surahRow(c.id, actions))));
  }

  // --- search
  const search = h('label', { class: 'search' });
  search.innerHTML = icon('search');
  const input = h('input', { type: 'search', id: 'surah-search', placeholder: 'Search surah by name or number', autocomplete: 'off' }) as HTMLInputElement;
  input.value = query;
  search.append(input);
  root.append(h('h2', { class: 'home-heading' }, 'All surahs'), search);

  // --- the list
  const list = h('ol', { class: 'surahs' });
  const fill = () => {
    const q = query.trim().toLowerCase();
    list.replaceChildren(...allChapters()
      .filter((c) => !q || String(c.id) === q || c.name_complex.toLowerCase().includes(q) || c.translated_name.toLowerCase().includes(q) || c.name_arabic.includes(q))
      .map((c) => surahRow(c.id, actions)));
    if (!list.children.length) list.append(h('li', { class: 'surah-none' }, 'No surah matches that.'));
  };
  input.addEventListener('input', () => { query = input.value; fill(); });
  fill();
  root.append(list);
  return root;
}

function surahRow(id: number, actions: HomeActions): HTMLElement {
  const c = getChapter(id)!;
  const { pages, added } = surahCoverage(id);
  const available = pages.length > 0;
  const full = added === c.verses_count;
  const status = !available ? 'not added yet' : full ? `${c.verses_count} ayahs` : `${added} of ${c.verses_count} ayahs added`;

  const row = h('button', { type: 'button', class: `surah${available ? '' : ' unavailable'}` });
  if (!available) row.setAttribute('aria-disabled', 'true');
  // The number in an eight-pointed star, the traditional surah marker.
  const badge = h('span', { class: 'surah-badge', 'aria-hidden': 'true' });
  badge.innerHTML = '<svg viewBox="0 0 40 40"><rect x="8" y="8" width="24" height="24" rx="2"/><rect x="8" y="8" width="24" height="24" rx="2" transform="rotate(45 20 20)"/></svg>';
  badge.append(h('span', {}, String(id)));
  row.append(
    badge,
    h('span', { class: 'surah-text' },
      h('span', { class: 'surah-name' }, c.name_complex),
      h('span', { class: 'surah-meta' }, `${c.translated_name} · ${status}`)),
    h('span', { class: 'surah-arabic', lang: 'ar', dir: 'rtl' }, c.name_arabic),
  );
  if (available) {
    const chevron = h('span', { class: 'surah-go', 'aria-hidden': 'true' });
    chevron.innerHTML = icon('chevronRight');
    row.append(chevron);
    row.addEventListener('click', () => actions.openPage(firstPageOf(id, pages), 'mushaf'));
  }
  row.setAttribute('aria-label', `${id}. ${c.name_complex}, ${status}`);
  return h('li', {}, row);
}

/** The page where the surah itself begins (its heading), else its first added page. */
function firstPageOf(id: number, pages: number[]): number {
  return pages.find((n) => getPage(n)!.lines.some((l) => l.type === 'surah_name' && l.surah === id)) ?? pages[0];
}
