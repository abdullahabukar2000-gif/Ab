import { getChapter } from './data';

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
