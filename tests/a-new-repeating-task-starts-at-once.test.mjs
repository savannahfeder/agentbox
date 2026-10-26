// A NEW REPEATING TASK STARTS ITS FIRST RUN AT ONCE (w-fadbbea8ef, 2026-10-26).
//
// The first run's ideas are jobs that keep running, and sending one lands on
// its first run in In progress. A new rule is owed at once, but nothing woke the
// supervisor after `zero:compose-repeat`, so that run waited for the next
// fifteen-second tick and In progress sat empty under the person's eyes.
// `zero:compose` already wakes it; measured by reading the two handlers.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ipc = fs.readFileSync(path.join(root, 'main/ipc.mjs'), 'utf8');

function handler(name) {
  const at = ipc.indexOf(`ipcMain.handle('${name}'`);
  expect(at).toBeGreaterThan(-1);
  const next = ipc.indexOf('ipcMain.handle(', at + 1);
  return ipc.slice(at, next < 0 ? undefined : next);
}

describe('composing', () => {
  it('a task wakes the supervisor, which is the behaviour a repeat now matches', () => {
    expect(handler('zero:compose')).toMatch(/supervisor\.wake\(\)/);
  });
  it('a repeating task wakes the supervisor too, so its first run starts now', () => {
    expect(handler('zero:compose-repeat')).toMatch(/supervisor\.wake\(\)/);
  });
  it('a change to a rule does not, since it starts nothing', () => {
    expect(handler('zero:set-repeat')).not.toMatch(/supervisor\.wake\(\)/);
  });
});
