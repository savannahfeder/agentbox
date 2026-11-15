// SIGNING OUT ON THE PHONE FORGETS WHAT WAS TYPED AND NOT SENT (QA M-46,
// native Android, 2026-11-10).
//
// Words typed into New thread and not sent were back in the box after Settings
// › Sign out and signing in again. On a shared phone the next person would read
// them. Sign out cleared the session, the cache and the rows, and left the
// draft file alone. Measured from the tester's dumps and by reading signOut.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { forgetDrafts, saveDraftOf, readDraftOf, syncStore } from '../mobile/src/lib/drafts';

const store = () => syncStore({ read: () => null, write: async () => {}, wait: 60_000 });

describe('forgetting drafts', () => {
  it('empties the new-thread box, every reply box and a teammate chat', () => {
    const s = store();
    saveDraftOf('new', { text: 'half a thought', files: [], priority: 'high' }, s);
    saveDraftOf({ product: 'site', id: 'w-1' }, { text: 'a reply', files: [{ name: 'a.png', dataBase64: 'AAAA' }], priority: null }, s);
    saveDraftOf({ product: 'teammate:', id: 't-1' }, { text: 'hi', files: [], priority: null }, s);
    forgetDrafts(s);
    expect(readDraftOf('new', s).text).toBe('');
    expect(readDraftOf({ product: 'site', id: 'w-1' }, s)).toMatchObject({ text: '', files: [] });
    expect(readDraftOf({ product: 'teammate:', id: 't-1' }, s).text).toBe('');
  });

  it("keeps what belongs to the phone, not the person's words", () => {
    const s = store();
    s.setItem('agentbox.look', 'dark');
    s.setItem('zero.lastProduct', 'site');
    saveDraftOf('new', { text: 'x', files: [], priority: null }, s);
    forgetDrafts(s);
    expect(s.getItem('agentbox.look')).toBe('dark');
    expect(s.getItem('zero.lastProduct')).toBe('site');
  });

  it("works on a browser's storage, which counts its keys rather than listing them", () => {
    const m = new Map([['zero.draft.site:w-1', 'a'], ['zero.draftimg.site:w-1', '[]'], ['zero.replysending.site:w-1', '[]'], ['other', 'kept']]);
    const web = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    forgetDrafts(web);
    expect([...m.keys()]).toEqual(['other']);
  });

  it('is part of signing out', () => {
    const cloud = fs.readFileSync(new URL('../mobile/src/state/cloud.tsx', import.meta.url), 'utf8');
    const signOut = cloud.slice(cloud.indexOf('const signOut = useCallback'), cloud.indexOf('}, [cloud, setRows, keepAlerts, notice]);'));
    expect(signOut).toMatch(/forgetDrafts\(appStore\)/);
  });
});
