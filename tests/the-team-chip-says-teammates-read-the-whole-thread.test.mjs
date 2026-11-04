// The Team chip said teammates see "its summary on the Team board", but Sofia
// opened Dev's thread from Search and read his whole message and his agent's
// whole answer. Measured in main/team/thread-share.mjs:
// a shared thread sends its newest 40 messages and the files they name, not a
// summary. So the words say what is shared.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VISIBILITY_ROWS } from '../renderer/src/threads/composer-rules.ts';

const line = (id) => VISIBILITY_ROWS.find((r) => r.id === id).line;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

it('Team says teammates can read the thread and its files', () => {
  expect(line('team')).toBe('Teammates can open it and read it, with its files.');
});

it('Chosen people says the people picked can read it', () => {
  expect(line('people')).toBe('Only the people you pick can open and read it.');
  expect(read('renderer/src/threads/ThreadComposer.tsx')).toContain('can open and read it.`');
});

it('Private still says only you see it', () => {
  expect(line('private')).toBe('Only you see it. It is not on the Team board.');
});

it('nothing promises teammates only a summary', () => {
  for (const file of ['renderer/src/threads/composer-rules.ts', 'renderer/src/threads/ThreadComposer.tsx', 'renderer/src/team/TeamPage.tsx', 'renderer/src/components/Settings.tsx']) {
    expect(read(file), file).not.toMatch(/sees? (?:its|a short) summary/);
  }
});
