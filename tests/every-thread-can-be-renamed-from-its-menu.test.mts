// EVERY THREAD CAN BE RENAMED FROM ITS MENU (w-8b637c7802).
//
// A tester sent "add a rate limitr to the login handler", opened the thread
// and looked in More actions for a way to fix the typo: it offered Open
// terminal and Pin thread. Rename was there for a team conversation only,
// though the title bar and ⌘K rename any thread you started. Measured by
// reading the rule Focus hands the menu and drawing the menu with it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const focus = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/Focus.tsx'), 'utf8');
const labels = (opts) => threadMenuRows({ change: false, terminal: 'closed', finish: true, ...opts }).map((r) => r.label);

describe('the More actions menu', () => {
  it('is offered Rename on any thread opened from a list that is not an outside agent', () => {
    expect(focus).toMatch(/onRename=\{crumbFrom && !agent \? \(\) => setRenameAt\(Date\.now\(\)\) : null\}/);
  });

  it('lists Rename when it is offered, under the terminal', () => {
    expect(labels({ rename: true, pin: 'unpinned' })).toEqual(['Open terminal', 'Rename', 'Pin thread', 'Mark done']);
  });

  it('lists no Rename when it is not', () => {
    expect(labels({ rename: false })).not.toContain('Rename');
  });
});
