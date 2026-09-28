// The app must get as far as drawing its page every time it starts.
//
// 2026-09-24, 15:14: she launched Agentbox and got an empty dark window, and
// it stayed empty. The crash report said `ReferenceError: Cannot access
// '<str>' before initialization` at main/main.mjs:563, 165 ms after launch.
// Commit 3ef1d54a had started handing `ipcMain` to registerIpc on line 563,
// but createWindow also said `const { ipcMain } = await import('electron')`
// on line 726. That second line re-declares the name for the whole function,
// so every use of it above line 726 throws. The throw landed in an unhandled
// rejection, the page was never loaded, and no IPC handler was ever
// registered: the running app had 0 of its handlers and a window with no URL.
//
// Asserted against the source: the main process is not something this suite
// can boot. The rule is that a name imported from 'electron' at the top of
// main.mjs is never declared again inside it, because a re-declaration shadows
// the import for its whole scope, lines above it included.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main', 'main.mjs'), 'utf8');

function topElectronImports(src) {
  const m = src.match(/^import\s*\{([^}]*)\}\s*from\s*'electron';/m);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
}

// Every later `const|let|var` that declares one of those names, either
// directly or by destructuring.
function redeclared(src) {
  const names = topElectronImports(src);
  const found = [];
  const decl = /\b(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=/g;
  for (const m of src.matchAll(decl)) {
    const bound = m[1].startsWith('{')
      ? m[1].slice(1, -1).split(',').map((s) => s.trim().split(/\s*:\s*/).pop()).filter(Boolean)
      : [m[1]];
    for (const name of bound) if (names.includes(name)) found.push(name);
  }
  return found;
}

describe('the window draws when the app starts', () => {
  it('main.mjs never re-declares a name it imported from electron', () => {
    expect(topElectronImports(main)).toContain('ipcMain');
    expect(redeclared(main)).toEqual([]);
  });

  it('catches the exact line that blanked the window on 2026-09-24', () => {
    const src = "import { app, ipcMain } from 'electron';\nasync function f() {\n  use(ipcMain);\n  const { ipcMain } = await import('electron');\n}";
    expect(redeclared(src)).toEqual(['ipcMain']);
  });

  it('catches a plain re-declaration too, not only a destructured one', () => {
    const src = "import { app, dialog } from 'electron';\nfunction f() { let dialog = null; }";
    expect(redeclared(src)).toEqual(['dialog']);
  });

  it('does not flag a local name electron was never imported as', () => {
    const src = "import { app } from 'electron';\nasync function f() { const { ipcMain } = await import('electron'); }";
    expect(redeclared(src)).toEqual([]);
  });

  it('does not flag using or reading the imported name', () => {
    const src = "import { app, ipcMain } from 'electron';\nconst handlers = ipcMain._invokeHandlers;\nconst x = host.ipcMain;";
    expect(redeclared(src)).toEqual([]);
  });

  it('follows a rename in the import, as `screen as electronScreen` is', () => {
    const src = "import { screen as electronScreen } from 'electron';\nfunction f() { const screen = 1; const electronScreen = 2; }";
    expect(redeclared(src)).toEqual(['electronScreen']);
  });
});
