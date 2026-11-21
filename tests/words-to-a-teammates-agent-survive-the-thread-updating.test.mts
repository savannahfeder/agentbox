// WORDS TO A TEAMMATE'S AGENT SURVIVE THE THREAD UPDATING (w-f702d60afe, round nine, 2026-11-20).
//
// The PM tester was helping on Lena's thread, typing to Lena's agent: "Lena's
// new message and agent result appeared, but my typed draft and the composer
// disappeared". The box held its words in the page's own state, which anything
// that drew the page again from nothing threw away. The words now live in the
// draft store, per teammate and thread, as the reply box's do, and come back
// whenever the page is drawn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe("the box on a teammate's thread", () => {
  it('starts from the draft kept for this teammate and thread', () => {
    expect(page).toMatch(/const draftAt = useMemo\(\(\) => \(\{ product: `teammate:\$\{personId\}`, id: threadId \}\), \[personId, threadId\]\);/);
    expect(page).toMatch(/const \[draft, setDraftHere\] = useState\(\(\) => readDraft\(draftAt\)\);/);
    expect(page).toMatch(/useEffect\(\(\) => \{ setWork\(null\); setDraftHere\(readDraft\(draftAt\)\); \}, \[draftAt\]\);/);
  });
  it('keeps every change, and lets go of it once sent', () => {
    expect(page).toMatch(/const setDraft = \(text: string\) => \{ setDraftHere\(text\); saveDraft\(draftAt, text\); \};/);
    expect(page).toMatch(/if \(!out\?\.ok\) \{[^\n]*\}\n\s*setDraft\(''\);/);
  });
});
