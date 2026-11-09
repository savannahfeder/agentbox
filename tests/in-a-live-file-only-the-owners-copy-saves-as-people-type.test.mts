// IN A LIVE FILE ONLY THE OWNER'S COPY SAVES AS PEOPLE TYPE.
//
// Three testers on one team (2026-11-08) scored live editing 2, 2 and 3 out
// of 10. Most of what broke came from teammates' copies saving while they
// typed: every save went through the owner as a new version, so the version
// count jumped (v1 of 4, v4 of 4, v3 of 3, v25), a bar said "Ana saved v4
// while you were editing", the same "Updated" message posted twice, and a
// teammate's copy of a doc past the cloud's size for an edit said "too long to
// edit from here" and would not let them leave. And no teammate could open the
// shared table at all: a thread sent its documents to the team but never its
// tables. Now only the owner's copy saves as people type, a teammate's saves
// once on leaving when it holds the room, a refused save lets them go with
// their words kept, and a thread's tables reach the team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('a live document', () => {
  const doc = read('renderer/src/components/DocText.tsx');
  it('saves as people type only on the owner\'s copy', () => {
    expect(doc).toContain('if (room && (!room.keeper || !room.me.owner)) return;');
  });
  it('does not save on a teammate\'s copy just because it took over keeping the room', () => {
    expect(doc).toContain('!collab?.keeper || !collab.me.owner) return;');
  });
});

describe('leaving a live document', () => {
  it('lets a teammate go when their save is refused, keeping their words', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toContain('if (ok) onClose(); else if (liveSession) { dropSitting(); onClose(); }');
    expect(view).toContain('if (ok) go(); else if (liveSession) { dropSitting(); go(); }');
  });
});

describe('a shared thread', () => {
  it('sends its tables to the team as it sends its documents', () => {
    const kinds = /const KINDS = '([^']+)'/.exec(read('main/team/thread-share.mts'))[1].split('|');
    expect(kinds).toEqual(expect.arrayContaining(['csv', 'tsv', 'md']));
    // `.key` stays out: it is also what a private key is called.
    expect(kinds).not.toContain('key');
  });
});
