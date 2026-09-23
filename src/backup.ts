// A backup file of the memoriser's groups and notes: download it, and restore
// from it later (on any device, with or without the account).

import { allNotes, isNote, mergeNotes } from './notes';
import { claudeHost } from './sync';

const APP = 'hifz-mushaf';

interface Downloads { save(r: { filename: string; data: string }): Promise<{ status: string }> }

export async function downloadBackup(): Promise<string> {
  const data = JSON.stringify({ app: APP, version: 1, exportedAt: new Date().toISOString(), notes: allNotes() }, null, 1);
  const filename = `hifz-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const downloads = (await claudeHost()?.use('downloads')) as Downloads | null | undefined;
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      return 'Backup saved.';
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return 'Backup not saved.';
      if (code === 'rate_limited') return 'A save is already waiting for you to confirm.';
      return 'Saving files isn’t available here.';
    }
  }
  // Outside the Claude viewer: an ordinary browser download.
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Backup saved.';
}

/** Read a backup file; resolves the notes it holds, or an error to show. */
export async function readBackup(file: File): Promise<{ notes: Record<string, unknown>; count: number } | { error: string }> {
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.app !== APP || typeof parsed.notes !== 'object' || parsed.notes === null) {
      return { error: 'That file isn’t a Hifz Mushaf backup.' };
    }
    const valid = Object.values(parsed.notes).filter(isNote);
    return { notes: parsed.notes, count: valid.filter((n) => !n.deleted).length };
  } catch {
    return { error: 'That file couldn’t be read. Choose the .json backup you downloaded.' };
  }
}

/** Restore: the backup's copy of each ayah replaces this one. */
export function restoreBackup(notes: Record<string, unknown>): void {
  mergeNotes(notes, 'incoming');
}
