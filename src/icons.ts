// Line icons for the buttons: 24×24, drawn with the current text colour.

const paths = {
  // an open book: the mushaf page view
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  // stacked lines: verse by verse
  rows: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
  onePage: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  twoPages: '<rect x="2.5" y="4" width="9" height="16" rx="1.2"/><rect x="12.5" y="4" width="9" height="16" rx="1.2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2"/><path d="M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  undo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

/** Fill a button with an icon and a label. */
export function iconButton(button: HTMLButtonElement, name: IconName, label: string): HTMLButtonElement {
  button.innerHTML = `${icon(name)}<span class="label">${label}</span>`;
  return button;
}
