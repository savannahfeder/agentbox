// A synthetic tester on the phone (2026-11-06, finding 2) typed a message to
// Chief of staff, tapped Back, opened Chats and came back: the box was empty,
// twice out of twice. The thread reply box kept its draft, but the AI
// teammate's box (MateComposer) held its words in the screen's own state, so
// they died with the screen. It now keeps them under a draft key per teammate,
// in the same store the thread drafts use.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mateDraft, readDraftOf, saveDraftOf, takeDraftOf } from '../mobile/src/lib/drafts';

const memory = () => { const kept = new Map(); return { kept, getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); }, removeItem: (k) => { kept.delete(k); } }; };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const words = (text) => ({ text, files: [], priority: null });

describe('a message to an AI teammate', () => {
  it('is still there when the chat opens again', () => {
    const store = memory();
    saveDraftOf(mateDraft('chief'), words('yes on the signup fix'), store);
    expect(readDraftOf(mateDraft('chief'), store).text).toBe('yes on the signup fix');
  });

  it('belongs to that teammate only, and the new-teammate box has its own', () => {
    const store = memory();
    saveDraftOf(mateDraft('chief'), words('for the chief'), store);
    expect(readDraftOf(mateDraft('quality'), store).text).toBe('');
    expect(readDraftOf(mateDraft(null), store).text).toBe('');
  });

  it('never lands on a thread, whatever the teammate is called', () => {
    const store = memory();
    saveDraftOf(mateDraft('w-1'), words('to the teammate'), store);
    expect(readDraftOf({ product: 'alpha@a1b2c3d4e5f6', id: 'w-1' }, store).text).toBe('');
  });

  it('a send takes it out of the box', () => {
    const store = memory();
    saveDraftOf(mateDraft('chief'), words('sent'), store);
    takeDraftOf(mateDraft('chief'), store);
    expect(readDraftOf(mateDraft('chief'), store).text).toBe('');
  });

  it('the box reads and writes the draft rather than its own state', () => {
    const box = read('mobile/src/ui/Teammates.tsx');
    expect(box).toMatch(/useDraft\(mateDraft\(/);
    expect(box).not.toMatch(/const \[text, setText\] = useState\(''\)/);
    expect(read('mobile/src/app/teammate/[id].tsx')).toMatch(/<MateComposer[^>]*mate=\{t\.id\}/s);
  });
});
