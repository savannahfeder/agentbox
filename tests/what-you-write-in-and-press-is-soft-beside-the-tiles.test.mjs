// WHAT YOU WRITE IN AND PRESS IS SOFT BESIDE THE TILES, AND A COMMENT WEARS ITS WRITER'S FACE.
//
// Seen on screen: the New thread sheet and Send, the reply box, the Chats composer,
// Done and ... stayed square next to round faces and tiles, and a comment by a
// person named Seat wore "SO". A comment's line has no author when it is yours,
// so the face looked up nobody and drew the first letters of "Someone".
//
// What must NOT change: list rows and the frame stay as they are, and an AI
// teammate keeps its dashed rounded square.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';

const soft = fs.readFileSync(new URL('../renderer/src/soft-corners.css', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8')
  + fs.readFileSync(new URL('../renderer/src/components/FileNoteCard.tsx', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../renderer/src/main.tsx', import.meta.url), 'utf8');

describe('the soft controls', () => {
  it('load after the rules they soften', () => {
    expect(entry.indexOf('soft-corners.css')).toBeGreaterThan(entry.indexOf('styles.css'));
  });
  for (const sel of ['.dock-card', '.modal.compose', '.rm-compose', '.dock-send', '.ts-done', '.ts-more', '.tc-send', '.cx-search']) {
    it(`include ${sel}`, () => expect(soft).toContain(sel));
  }
  it('reach the reply box past the workspace rule that outranks a plain .dock-card', () => {
    expect(soft).toContain('.workspace-layout .dock-card');
  });
  it('use the corners the tiles use and no number of their own', () => {
    for (const m of soft.matchAll(/border-[a-z-]*radius:\s*([^;]+);/g)) expect(m[1]).toMatch(/^(var\(--artifact-corner(-small)?\)|inherit)$/);
  });
  it('leave list rows, the frame and an AI teammate alone', () => {
    for (const sel of ['.gc-row', '.cx-row', '.th-row', '.panel', '.mate', '.tm-av']) expect(soft).not.toContain(sel);
  });
});

describe('a comment\'s face', () => {
  it('finds you when the line has no author', () => {
    expect(view).toMatch(/people\.find\(\(p\) => p\.id === \(id \?\? me\)\)/);
  });
  it('is named by who said it when nobody on the team matches, never by the word Someone', () => {
    expect(view).toMatch(/name=\{person\(note\.by\) \? undefined : whoSaid\(note\.by\)\}/);
    expect(view).toMatch(/name=\{person\(r\.by\) \? undefined : whoSaid\(r\.by\)\}/);
  });
});
