// launch-timeline.png stood on a grey skeleton of a text page for 25+ seconds and never opened
// (weight 4), and a film comment emptied the box with nothing in the list for 8+ s
// (weight 3). Measured on the copies: the file was a healthy 70 KB PNG on disk, so the
// wait was the app's and the screen had no way to end it. These hold the end of each wait.
// The components themselves render in a browser; the source checks stand in for that because a
// symlinked node_modules cannot render React here.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { notesWithSaving } from '../renderer/src/note-saving.ts';
import { OPEN_WITHIN_MS, didNotOpen, opensLike } from '../renderer/src/opening-wait.ts';
import { STILL_READING, NOT_ANSWERING, threadWaitWords } from '../renderer/src/not-answering.ts';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('how long an opened file may take', () => {
  it('is long past a loaded machine and short of giving up on it', () => {
    expect(OPEN_WITHIN_MS).toBe(20_000);
  });

  it('says which file', () => {
    expect(didNotOpen('launch-timeline.png')).toBe('launch-timeline.png did not open.');
  });

  it('shows a skeleton of words only for a document', () => {
    expect(opensLike('markdown')).toBe('words');
    for (const kind of ['image', 'film', 'pdf', 'deck']) expect(opensLike(kind)).toBe('plain');
    expect(opensLike(null)).toBe('plain');
  });
});

describe('every wait on the big view has an end', () => {
  it('does not leave the document skeleton or the resolving skeleton without one', () => {
    const stage = read('components/ArtifactStage.tsx');
    expect(stage).not.toMatch(/return <PreviewLoading \/>/);
    expect(stage.match(/<OpeningWait /g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('gives the picture and the film an end too', () => {
    expect(read('components/ArtifactStage.tsx')).toMatch(/OPEN_WITHIN_MS/);
    expect(read('components/FilmPlayer.tsx')).toMatch(/OPEN_WITHIN_MS/);
  });

  it('does not call a file a thread while it opens', () => {
    expect(read('components/ArtifactView.tsx')).not.toContain('Reading this thread');
  });

  it('lets go of a film when it leaves the screen, or the connection stays taken', () => {
    expect(read('components/FilmPlayer.tsx')).toMatch(/removeAttribute\('src'\)[\s\S]*\.load\(\)/);
  });
});

describe('a thread being read', () => {
  it('says nothing alarming for the first six seconds', () => {
    expect(threadWaitWords(5_999)).toBe(null);
  });

  it('says it is still reading once it is slow, which is not the same as stopped', () => {
    expect(threadWaitWords(6_000)).toBe(STILL_READING);
    expect(threadWaitWords(29_999)).toBe(STILL_READING);
  });

  it('says the app is not answering only when that is what it looks like', () => {
    expect(threadWaitWords(30_000)).toBe(NOT_ANSWERING);
  });
});

describe('a comment you just sent', () => {
  const saved = { id: 'a', text: 'saved' };
  const mine = { id: 'b', text: 'mine', saving: true };

  it('is in the list at once', () => {
    expect(notesWithSaving([saved], [mine])).toEqual([saved, mine]);
  });

  it('appears once when the saved copy arrives, as the saved copy', () => {
    const arrived = { id: 'b', text: 'mine' };
    expect(notesWithSaving([saved, arrived], [mine])).toEqual([saved, arrived]);
  });

  it('adds nothing with nothing saving', () => {
    const list = [saved];
    expect(notesWithSaving(list, [])).toBe(list);
  });
});
