// Keeps the memoriser's groups and notes in their Claude account, so the
// same link shows the same work on every device.
//
// Everything lives in one private document, `data/users/<id>/notes`, which
// only this person can read (not even others the link is shared with). This
// browser's copy is shown straight away; the account copy is merged in
// newest-wins per ayah, and local edits are pushed back, one write at a time,
// shortly after they stop. Outside the Claude viewer (or if the account
// can't be reached) the app simply keeps working from this browser.

import { allNotes, mergeNotes, onLocalWrite } from './notes';

export type SyncState = 'connecting' | 'account' | 'browser';

// Just the parts of the platform API this file uses.
interface DocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, error?: (e: { code: string }) => void): () => void;
}
interface Db { doc(path: string): DocRef }
interface User { id(): Promise<string | null> }
interface ClaudeHost { use(name: string): Promise<unknown> }

let state: SyncState = 'connecting';
const watchers = new Set<(s: SyncState) => void>();
export const syncState = () => state;
export function onSyncState(fn: (s: SyncState) => void): void { watchers.add(fn); }
function setState(next: SyncState): void {
  if (next === state) return;
  state = next;
  watchers.forEach((fn) => fn(state));
}

export function claudeHost(): ClaudeHost | null {
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

export async function startSync(): Promise<void> {
  const host = claudeHost();
  if (!host) { setState('browser'); return; }
  const [db, user] = await Promise.all([host.use('db'), host.use('user')]) as [Db | null, User | null];
  const uid = user ? await user.id() : null;
  if (!db || !uid) { setState('browser'); return; }

  const ref = db.doc(`data/users/${uid}/notes`);
  let writing = false;
  let again = false;
  let timer: number | undefined;

  const upload = async () => {
    if (writing) { again = true; return; }
    writing = true;
    try {
      await ref.set({ notes: allNotes(), savedAt: Date.now() });
      setState('account');
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'unavailable') { timer = window.setTimeout(upload, 1500 + Math.random() * 1500); }
      else setState('browser'); // view-only access or a refused write: keep working locally
    } finally {
      writing = false;
      if (again) { again = false; schedule(); }
    }
  };
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(upload, 800); };

  let first = true;
  ref.onSnapshot((snap) => {
    const remote = (snap.exists ? snap.data()?.notes : undefined) as Record<string, unknown> | undefined;
    const { localAhead } = mergeNotes(remote ?? {}, 'newer');
    if (first) {
      first = false;
      setState('account');
      if (localAhead) schedule(); // edits made here before (or while offline) go up
    }
  }, () => setState('browser'));

  onLocalWrite(schedule);
}
