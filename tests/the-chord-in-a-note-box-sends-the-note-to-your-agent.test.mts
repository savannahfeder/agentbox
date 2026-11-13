// ⌘↵ IN A NOTE BOX SENDS THE NOTE TO YOUR AGENT.
//
// On a picture your agent made, a note typed in the Notes box and sent with ⌘↵
// was only kept ("Note for your agent"): the chord fell through to Enter's
// branch in ArtifactView's onBoxKey, so the note waited for a second ⌘↵ on an
// empty box. The person kept expecting the first ⌘↵ to send it. Enter still
// keeps a note for Send.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { noteBoxKey, sentWithTheNote } from '../renderer/src/artifact-pins.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('a key in the note box', () => {
  const press = (over: Partial<Parameters<typeof noteBoxKey>[0]>) =>
    noteBoxKey({ key: 'Enter', chord: false, shift: false, composing: false, typed: true, waiting: 0, ...over });
  it('⌘↵ with words keeps the note and sends it', () => {
    expect(press({ chord: true })).toBe('note and send');
    expect(press({ chord: true, waiting: 2 })).toBe('note and send');
  });
  it('Enter with words still only keeps it', () => expect(press({})).toBe('note'));
  it('⌘↵ on an empty box sends what waits, and is an empty Enter when nothing waits', () => {
    expect(press({ chord: true, typed: false, waiting: 3 })).toBe('send waiting');
    expect(press({ chord: true, typed: false, waiting: 0 })).toBe('note');
  });
  it('Shift+Enter is a new line, and Enter mid-composition is the composition', () => {
    expect(press({ shift: true })).toBe('leave');
    expect(press({ composing: true })).toBe('leave');
    expect(press({ chord: true, composing: true })).toBe('leave');
  });
  it('another key is left alone', () => expect(press({ key: 'a', chord: true })).toBe('leave'));
});

describe('what ⌘↵ hands your agent', () => {
  it('a note for your agent goes with every note still waiting, once each', () => {
    expect(sentWithTheNote({ to: 'agent', now: false }, ['a', 'b'], 'n')).toEqual(['a', 'b', 'n']);
    expect(sentWithTheNote({ to: 'agent', now: true }, [], 'n')).toEqual(['n']);
    expect(sentWithTheNote({ to: 'agent', now: false }, ['n'], 'n')).toEqual(['n']);
  });
  it('a note to a teammate or kept on the file sends your agent nothing', () => {
    expect(sentWithTheNote({ to: 'person', person: 'u-maya' }, ['a'], 'n')).toEqual([]);
    expect(sentWithTheNote({ to: 'file' }, ['a'], 'n')).toEqual([]);
  });
});

describe('both note boxes take the chord', () => {
  it('the file view and the notes sidebar ask noteBoxKey and send with sentWithTheNote', () => {
    for (const f of ['renderer/src/components/ArtifactView.tsx', 'renderer/src/components/NotesSidebar.tsx']) {
      const src = read(f);
      expect(src, f).toMatch(/noteBoxKey\(/);
      expect(src, f).toMatch(/'note and send'/);
      expect(src, f).toMatch(/sentWithTheNote\(/);
    }
  });
});
