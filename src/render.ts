import type { Line, PageData } from './types';
import { BASMALAH_FAMILY, ensureFont, isConfirmed, pageFamily } from './fonts';
import { getChapter, surahOfPage } from './data';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** Odd pages sit on the right of a spread, even pages on the left, as in print. */
export const sideOf = (page: number) => (page % 2 ? 'right' : 'left');

function textLine(line: Line): HTMLElement {
  const row = el('div', `line text${line.centered ? ' centered' : ''}`);
  for (const w of line.words) {
    const span = el('span', w.type === 'end' ? 'w end' : 'w');
    span.dataset.key = w.verseKey;
    span.dataset.pos = String(w.pos);
    // Unicode first; the glyph code is only swapped in once the font is confirmed.
    span.textContent = w.uthmani;
    row.append(span);
  }
  return row;
}

function headingLine(line: Line): HTMLElement {
  const row = el('div', 'line heading');
  const name = getChapter(line.surah ?? 0)?.name_arabic ?? line.name?.replace(/^سورة\s+/, '') ?? '';
  const cartouche = el('div', 'cartouche');
  cartouche.append(el('span', 'heading-name', `سورة ${name}`));
  row.append(cartouche);
  return row;
}

function basmalahLine(): HTMLElement {
  // Left empty until the basmalah font is confirmed: no stand-in text is typed here.
  const row = el('div', 'line basmalah');
  row.append(el('span', 'bsml'));
  return row;
}

export function renderPage(data: PageData): HTMLElement {
  const page = el('article', 'page');
  page.dataset.page = String(data.page);
  page.dataset.side = sideOf(data.page);
  page.dataset.glyphs = 'pending';

  const chapter = surahOfPage(data);
  const head = el('header', 'furniture running-head');
  if (chapter) head.append(el('span', 'surah', chapter.name_complex));
  const foot = el('footer', 'furniture folio', String(data.page));

  const block = el('div', 'block');
  block.dir = 'rtl';
  block.lang = 'ar';
  for (const line of data.lines) {
    block.append(line.type === 'surah_name' ? headingLine(line) : line.type === 'basmalah' ? basmalahLine() : textLine(line));
  }

  page.append(head, block, foot);
  return page;
}

/**
 * Swap Unicode text for glyph codes once, and only once, the page's own font
 * is confirmed. Safe to call repeatedly; does nothing until then.
 */
export async function upgradeToGlyphs(pageEl: HTMLElement, data: PageData): Promise<void> {
  const family = pageFamily(data.page);
  const sample = data.lines.flatMap((l) => l.words.map((w) => w.code)).join('');
  const ok = isConfirmed(family) || (await ensureFont(family, sample));
  if (!ok || !pageEl.isConnected) return;

  const spans = pageEl.querySelectorAll<HTMLElement>('.line.text .w');
  const words = data.lines.flatMap((l) => l.words);
  spans.forEach((span, i) => { span.textContent = words[i].code; });
  const block = pageEl.querySelector<HTMLElement>('.block')!;
  block.style.setProperty('--page-font', `"${family}"`);
  pageEl.dataset.glyphs = 'ready';
  fitLines(pageEl);

  const bsml = pageEl.querySelectorAll<HTMLElement>('.bsml');
  if (bsml.length) {
    const code = data.lines.find((l) => l.type === 'basmalah')?.code ?? '';
    if (code && (isConfirmed(BASMALAH_FAMILY) || (await ensureFont(BASMALAH_FAMILY, code)))) {
      bsml.forEach((s) => { s.textContent = code; s.classList.add('ready'); });
    }
  }
}

/**
 * Lines are set flush to both edges like the printed page. The few lines that
 * are naturally wider than the text block are scaled down just enough to fit
 * (never up), rather than letting them overflow the margin.
 */
function fitLines(pageEl: HTMLElement): void {
  for (const line of pageEl.querySelectorAll<HTMLElement>('.line.text')) {
    line.style.fontSize = '';
    const over = line.scrollWidth / line.clientWidth;
    if (over > 1.001) line.style.fontSize = `${(1 / over).toFixed(4)}em`;
  }
}
