// A cloud Claude run asked Codex for an independent check, and Codex printed
// "Reading additional input from stdin" and sat there for six minutes while the
// thread said Working (overnight tester, 2026-11-16, twice). `codex exec` with a
// prompt still reads its input when that input is left open, as an agent's
// shell leaves it. The brief's own trial command did the same.
import { describe, it, expect } from 'vitest';
import { codexNote } from '../main/cloud/run.mts';

describe('what a cloud run is told about running Codex', () => {
  it('its trial command closes Codex\'s input', () => {
    expect(codexNote({ carried: true })).toMatch(/codex exec [^`]*< \/dev\/null`/);
  });

  it('it is told to close the input on every codex exec it runs', () => {
    expect(codexNote({ carried: true })).toMatch(/every `codex exec`[^.]*< \/dev\/null/);
  });

  it('a run with Codex signed out is not told how to run it', () => {
    expect(codexNote({ carried: false, state: 'broken' })).not.toContain('/dev/null');
  });
});
