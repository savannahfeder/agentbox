// BRINGING AN AGENT'S APP TO THE FRONT FINDS THE APP.
//
// w-a358961e3e, 2026-10-15, found while trimming comments in main/agents.mjs.
// `owningApp` called the async `processTable()` without awaiting it, so it
// called `.get` on a Promise and threw on every call. The IPC handler caught
// the throw and answered "cannot tell which window it is running in", so the
// button never worked and nothing said why. Measured: `owningApp(process.pid)`
// threw TypeError ("table.get is not a function") before the fix.
//
// Nothing here opens an app or moves focus: `owningApp` only reads `ps`, and
// `reveal` is only called for a pid that does not exist, which returns before
// `open` runs.

import { describe, it, expect } from 'vitest';
import { owningApp, reveal } from '../main/agents.mjs';

describe('finding the app an agent runs inside', () => {
  it('answers for a live process instead of throwing', async () => {
    const app = await owningApp(process.pid);
    if (app !== null) {
      expect(app.path).toMatch(/\.app$/);
      expect(typeof app.name).toBe('string');
    }
  });

  it('answers null for a process that does not exist', async () => {
    expect(await owningApp(2 ** 22 + 12345)).toBeNull();
  });

  it('says it cannot tell, for a process that does not exist, without opening anything', async () => {
    const out = await reveal(2 ** 22 + 12345);
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/cannot tell which window/);
  });
});
