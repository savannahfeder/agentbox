// ESC AFTER A REPLY GOES BACK TO THE LIST YOU CAME FROM (w-34443a206b).
//
// Testers on 2026-11-22 hit it seven times: open a thread from In progress,
// reply, press Esc, and land on Needs you. After a reply the pane follows the
// thread so it takes each fresh copy, and following was also the rule that
// sends you to Needs you on the way out, which is only meant for a slash
// command you watch answer, and for Stop. Measured on wayOut, which every way
// out of a thread asks, and on where App.tsx sets what it follows.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { followedAfter, wayOut } from '../renderer/src/stay-with-a-command';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');

describe('leaving a thread you replied on', () => {
  it('stays on the list you were on', () => {
    expect(wayOut({ product: 'p', id: 'w-1', reply: true }, null)).toBe('stay');
  });

  it('still goes to Needs you after a command you watched answer, or a Stop', () => {
    expect(wayOut({ product: 'p', id: 'w-1' }, null)).toBe('inbox');
  });
});

describe('what a reply follows', () => {
  it('a reply to a running agent follows the thread as a reply', () => {
    const live = app.slice(app.indexOf('    if (isRunning) {'), app.indexOf('    // TAKING A SEND BACK'));
    expect(live).toContain('setFollowing({ product: item.product, id: item.id, reply: true })');
  });

  it('a reply that keeps you on the thread follows it as a reply unless it was a command', () => {
    expect(app).toMatch(/if \(stay\) setFollowing\(followedAfter\(item, text, engine\)\)/);
    expect(followedAfter({ product: 'p', id: 'w-1' }, 'Use the second layout.')).toEqual({ product: 'p', id: 'w-1', reply: true });
    expect(followedAfter({ product: 'p', id: 'w-1' }, '/usage')).toEqual({ product: 'p', id: 'w-1' });
    expect(followedAfter({ product: 'p', id: 'w-1' }, '/usage', 'codex')).toEqual({ product: 'p', id: 'w-1', reply: true });
  });
});
