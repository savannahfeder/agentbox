// THE PRACTICE THREAD GOES TO PRACTICE AFTER CHATS ARE BROUGHT IN (w-fbe5e95dea, 2026-11-10).
//
// Walking the setup with twenty chats brought in, the walkthrough's practice
// thread was filed in Sandbox: the box on Home said Sandbox, the send opened
// a real thread that said "Nothing running", the practice answer never came,
// and the tip skipped to "Press R". Bringing chats in hands the newest chat's
// project to the app (onProject → setPickProject), and the box applies that
// pick when it opens, over the Practice project its opening words name. After
// a reload the pick was gone and the box said Practice, which is how it hid.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const firstRun = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');

describe('the box holding the practice thread', () => {
  it('is not handed the project the setup picked', () => {
    expect(app).toMatch(/selectProject=\{tourTask \? null : pickProject\}/);
    expect(app).not.toMatch(/selectProject=\{pickProject\}/);
  });
  it('still opens on Practice, from its opening words', () => {
    expect(app).toMatch(/tourTask \? \{ body: `\$\{TASK_TITLE\}\\n\\n\$\{TASK_BODY\}`, product: tourTask \}/);
  });
  it('leaves the pick for the first real thread, which goes where the newest chat ran', () => {
    expect(firstRun).toMatch(/if \(n === 1\) \{ try \{ localStorage\.setItem\(LAST_PRODUCT_KEY, p\.slug\); \}[^\n]*onProject\?\.\(p\.slug\); \}/);
    expect(app).toMatch(/onProject=\{\(slug\) => \{ rememberProject\(slug\); setPickProject\(slug\); \}\}/);
  });
});
