// THE OLD GIT DIFF SCREEN IS GONE, AND IT IS NOT COMING BACK BY ACCIDENT.
//
// It was wired end to end and called by nothing: ipcMain.handle('zero:diff')
// ran `git diff main...<ref>` in the product's repo, preload exposed it, and
// types.ts typed it. Focus.tsx drew its raw patch in a monospace slab under
// any message whose body happened to name a branch. All of that stays dead.
//
// WHAT CHANGED ON 2026-08-24, because this file used to forbid more than she
// did.
//
// The reason is measured rather than argued. A card drawn only from the
// agent's conversation is empty whenever the agent used sed or a script, which
// on her Mac was 101 of the 105 runs that changed a file over two days. So the
// disk is read as well, in ONE place: main/git-change.mjs, which photographs a
// run's own checkout when it spawns and reads it back when it exits. What
// stays forbidden is the old shape: a channel the renderer can ask for a patch
// on, a branch-versus-main diff, and a slab of raw patch on the screen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('the code an agent wrote comes out of the conversation, never out of git', () => {
  it('has no zero:diff channel in the main process', () => {
    expect(read('main/ipc.mjs')).not.toContain('zero:diff');
  });

  it('does not expose a diff call on the window', () => {
    expect(read('preload.cjs')).not.toContain('zero:diff');
    expect(read('preload.cjs')).not.toMatch(/^\s*diff:/m);
  });

  it('has no diff call in the api the renderer is typed against', () => {
    expect(read('renderer/src/types.ts')).not.toMatch(/^\s*diff\(p: \{ product: string; ref: string \}\)/m);
  });

  // AND THE SCREEN THAT CALLED IT IS GONE WITH IT. The earlier round recorded
  // this channel as having no callers and that was wrong: Focus.tsx rendered a
  // <DiffView> on every task, which put a quiet "code changes · zero/…" button
  // under the message whenever the body happened to name a branch, and printed
  // git's raw patch in a monospace slab. That is the git-shaped answer being
  // replaced, so it goes too.
  it('has no DiffView on the task screen and no styles for one', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).not.toContain('DiffView');
    expect(focus).not.toContain('window.zero?.diff');
    const css = read('renderer/src/styles.css');
    for (const rule of ['.diff-block', '.diff-more', '.diff-patch']) {
      expect(css, `styles.css still has ${rule}`).not.toContain(rule);
    }
  });

  // COMMENTS ARE STRIPPED BEFORE THIS LOOKS, and that is not a loosening.
  // What must not exist is a CALL; the reason for the shape we chose is
  // written out in prose in main/code-change.mjs, main/git-change.mjs and the
  // supervisor's exit handler, and all three have to be able to name the thing
  // they are refusing to do. Matching the prose made writing down the reason
  // fail the test.
  it('reads git in one file and nowhere else in the main process', () => {
    const files = fs.readdirSync(path.join(ROOT, 'main')).filter((f) => f.endsWith('.mjs'));
    const code = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    for (const f of files) {
      // 2026-09-16: an explicit /diff command is approved migration parity.
      // The automatic task diff screen remains absent.
      if (f === 'git-change.mjs' || f === 'task-commands.mjs') continue;
      const src = code(read(path.join('main', f)));
      expect(src, `${f} runs git diff`).not.toMatch(/'diff'|"diff"|git diff/);
    }
  });

  // AND THE ONE FILE THAT DOES READ GIT READS A RUN'S OWN CHECKOUT, not a
  // branch against main. Diffing a branch is what showed her another task's
  // work in a shared checkout, and it is empty on a product with no repository
  // at all. The photograph taken at spawn is what makes the window this run's.
  it('never diffs a branch against main, and never hands a patch to the window', () => {
    const src = read('main/git-change.mjs');
    expect(src).not.toMatch(/main\.\.\./);
    expect(src).not.toContain('ipcMain');
    expect(read('preload.cjs')).not.toContain('git-change');
  });
});
