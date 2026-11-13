// A TEAMMATE'S AGENT'S FILE SAYS WHOSE AGENT SHARED IT (2026-11-12).
//
// A tester opened his teammate's spec from her thread and its header read
// "Shared by your agent". A version an agent made carries no person, and the
// words fell back to "your". The review knows whose thread it is on, so a
// version with no person of its own is that person's agent's.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { sharedByWords } from '../shared/artifact-marks.mts';

const nameOf = (id) => ({ 'u-lena': 'Lena', 'u-theo': 'Theo' }[id] ?? 'A teammate');

describe('the words', () => {
  it("name the teammate's agent, and yours on your own thread", () => {
    expect(sharedByWords({ by: 'u-lena', agent: '' }, { me: 'u-theo', nameOf })).toBe("Shared by Lena's agent");
    expect(sharedByWords({ by: 'u-theo', agent: '' }, { me: 'u-theo', nameOf })).toBe('Shared by your agent');
    expect(sharedByWords({ by: null, agent: '' }, { me: 'u-theo', nameOf })).toBe('Shared by your agent');
  });
});

describe('the review', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
  it('reads a version with no person of its own as the thread owner\'s', () => {
    expect(view).toContain('sharedByWords({ ...v, by: v.by ?? ownerOfRow }, { me, nameOf })');
  });
  it("is told whose thread it is on a teammate's thread, and nobody's in Files", () => {
    expect(fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8')).toContain('ownerOfRow={personId}');
    expect(fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8')).toContain('ownerOfRow={null}');
  });
});
