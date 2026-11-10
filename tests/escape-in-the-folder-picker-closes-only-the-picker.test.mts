// ESCAPE IN THE FOLDER PICKER CLOSES ONLY THE PICKER (w-fbe5e95dea, 2026-11-10).
//
// A round-five tester ran "Set Agentbox up again", opened Choose a folder and
// pressed Escape to shut the picker: the whole setup closed and the inbox came
// back. The app's window listener leaves a re-run setup on Escape, and it runs
// before the picker's own handler. It stands aside while a picker is open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('Escape on a setup started again', () => {
  it('leaves the setup only when no folder picker is open', () => {
    const line = app.split('\n').find((l) => l.includes('leaveSetupAgain(); return;') && l.includes("'Escape'"));
    expect(line).toBeDefined();
    expect(line).toMatch(/!document\.querySelector\('\.fp-card'\)/);
  });
});

describe('the folder picker', () => {
  it('hears Escape wherever focus is, not only inside its card', () => {
    // Checked by hand on a copy: the picker opened with focus on the page, and
    // Escape reached nothing in it.
    const fp = fs.readFileSync(new URL('../renderer/src/components/FolderPicker.tsx', import.meta.url), 'utf8');
    expect(fp).toMatch(/window\.addEventListener\('keydown', onEscape, true\)/);
  });
});

describe('Use this folder on a folder it cannot use', () => {
  // A round-five tester pressed it on the home folder the picker opens on and
  // nothing happened: the button was disabled, and the reason was held back
  // until somebody moved. Pressing it now says the reason.
  it('stays pressable and shows why', () => {
    const fp = fs.readFileSync(new URL('../renderer/src/components/FolderPicker.tsx', import.meta.url), 'utf8');
    expect(fp).toMatch(/if \(want === here\) \{ if \(canUse\) onPick\(here\); else setMoved\(true\); return; \}/);
    expect(fp).toMatch(/className="fp-use" onClick=\{\(\) => void use\(\)\} disabled=\{busy\}/);
  });
});

describe('the folder picker sits in the middle of the window', () => {
  // The founder asked for centred dialogs; round-six pictures showed this one
  // hanging from 12% down, the way the command bar does.
  it('centres its card', () => {
    const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.modal-backdrop\.fp-backdrop \{ place-items: center; padding-top: 0; \}/);
  });
});
