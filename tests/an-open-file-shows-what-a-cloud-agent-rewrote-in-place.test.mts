// An open file shows what a cloud agent rewrote in place.
//
// What broke: in the overnight Cloud test (2026-11-16, round four) a tester
// kept docs/persistence.md open while a cloud Codex agent rewrote it in place
// and committed it (446a07c). The answer said "Updated persistence.md in
// place"; the pane still ended at "Deployment assumptions", Edited 2 min ago,
// and the commit was on the Mac's branch and main. The pane beside the chat
// read a file once, when it opened, and nothing read it again. Last night's
// fix made the version list follow the app, not the words in the pane.
//
// The rule: while the app changes, the open pane reads its file again at most
// every few seconds and takes the text only when the file on disk is newer
// than the one it shows. Words you are typing are DocText's to keep.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { newerOnDisk } from '../renderer/src/doc-pane';

const pane = fs.readFileSync(new URL('../renderer/src/components/DocPane.tsx', import.meta.url), 'utf8');

describe('a read of the open file', () => {
  it('is taken when the file on disk is newer than the one shown', () => {
    expect(newerOnDisk(1000, { ok: true, text: 'rollout', mtime: 2000 })).toBe(true);
  });

  it('is not taken when it is the same file, or an older one', () => {
    expect(newerOnDisk(2000, { ok: true, text: 'same', mtime: 2000 })).toBe(false);
    expect(newerOnDisk(2000, { ok: true, text: 'older', mtime: 1500 })).toBe(false);
  });

  it('is not taken when the read failed or said no time', () => {
    expect(newerOnDisk(1000, { ok: false, mtime: 3000 })).toBe(false);
    expect(newerOnDisk(1000, { ok: true, text: 'x' })).toBe(false);
  });
});

describe('the open pane', () => {
  it('reads its file again as the app changes, not on every change', () => {
    expect(pane).toContain('api.onChanged(follow.changed)');
    expect(pane).toMatch(/askAtMostEvery\(FOLLOW_FILE_MS,/);
  });

  it('never lets words you have not saved take the newer file\'s time', () => {
    const editor = fs.readFileSync(new URL('../renderer/src/components/DocText.tsx', import.meta.url), 'utf8');
    expect(editor).toContain('useEffect(() => { if (!dirty.current) lastMtime.current = mtime; }, [mtime]);');
  });
});
