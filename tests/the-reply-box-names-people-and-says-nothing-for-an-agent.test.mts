// THE REPLY BOX NAMES PEOPLE AND SAYS NOTHING FOR AN AGENT (2026-11-01).
//
// On the team version, every agent thread drew "Replying to the agent on
// Multiplayer interface for agent teams" over its reply box, and R on the list
// toasted the same: the thread's title is already at the top of the screen, so
// the line said nothing. Over a thread with people it still says who will read
// it. Measured by reading what replyingTo returns and where it is drawn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { replyingTo, replyTarget } from '../renderer/src/reply-keys.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the line over the reply box', () => {
  it('says nothing for an agent thread', () => {
    expect(replyingTo({ people: null })).toBeNull();
    expect(replyingTo({ people: [] })).toBeNull();
    expect(replyTarget({ people: null })).toEqual({ kind: 'agent', words: null, names: [] });
  });
  it('still names the people a thread is with', () => {
    expect(replyingTo({ people: ['Dev'] })).toBe('Replying to Dev');
    expect(replyingTo({ people: ['Sofia', 'Dev', 'Maya'] })).toBe('Replying to Sofia, Dev and Maya');
  });
  it('the box draws the line only for people, and R toasts only when there is something to say', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/to\.kind === 'person' && <div className=\{`dock-to/);
    const app = read('renderer/src/App.tsx');
    expect(app).not.toMatch(/showToast\(replyingTo\(/);
    expect(app.match(/const whose = replyingTo\(/g)?.length).toBe(2);
  });
});
