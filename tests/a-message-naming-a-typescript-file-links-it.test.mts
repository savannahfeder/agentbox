// The back end moved from .mjs to .mts (2026-11-01), so agents now name files
// like main/supervisor.mts in their answers. The two rules that turn a named
// file into something you can open knew .mjs and .cjs but not .mts or .cts:
// the source-file rule both the website and the phone app use
// (renderer/src/source-reference.ts), and the referenced-files list
// (shared/referenced-files.mts). A test on the phone's markdown found it, when
// its sample `main/main.mts` came back as plain text.
import { describe, it, expect } from 'vitest';
import { sourceReference } from '../renderer/src/source-reference.ts';
import { referencedFiles } from '../shared/referenced-files.mts';

describe('a message naming a TypeScript back-end file', () => {
  it('is a source reference, like a .mjs one', () => {
    expect(sourceReference('main/supervisor.mts')).toBe('main/supervisor.mts');
    expect(sourceReference('main/supervisor.mts:120')).toBe('main/supervisor.mts');
    expect(sourceReference('scripts/build.cts')).toBe('scripts/build.cts');
    expect(sourceReference('main/supervisor.mts')).toBe('main/supervisor.mts');
  });

  it('is not stretched to an ending that is not a source file', () => {
    expect(sourceReference('notes.mtx')).toBeNull();
    expect(sourceReference('notes.xts')).toBeNull();
  });

  it('is listed among the files a message names', () => {
    expect(referencedFiles('I changed main/supervisor.mts and shared/rank.mts')).toEqual(['main/supervisor.mts', 'shared/rank.mts']);
  });
});
