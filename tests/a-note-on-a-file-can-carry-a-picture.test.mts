// A NOTE ON A FILE CAN CARRY A PICTURE.
//
// The note box beside a file opened full screen took words only: a pasted
// screenshot did nothing and a dropped one did nothing, so a note that needed a
// picture could not be written. Measured in ArtifactView: its textarea had no
// paste or drop handler, and the send wrote `text` alone.
//
// The picture is saved the way the reply box saves one, into the product's
// attachments/, and rides in the note's text as `![name](attachments/...)`, so
// the agent is handed it by the same path a pasted reply picture takes. The
// card draws it as a picture, never as the raw link.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { noteWithPictures, notePictures } from '../renderer/src/note-pictures.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('a note keeps its pictures in its text', () => {
  it('puts the saved picture after the words, on the same line', () => {
    expect(noteWithPictures('make this bigger', '![shot.png](attachments/a-shot.png)'))
      .toBe('make this bigger ![shot.png](attachments/a-shot.png)');
  });

  it('a note can be a picture alone', () => {
    expect(noteWithPictures('  ', '![shot.png](attachments/a-shot.png)')).toBe('![shot.png](attachments/a-shot.png)');
  });

  it('several pictures stay on one line, so the note is still one bullet for the agent', () => {
    const text = noteWithPictures('both', '![a.png](attachments/a.png)\n![b.png](attachments/b.png)');
    expect(text).not.toContain('\n');
    expect(notePictures(text).pictures.map((p) => p.src)).toEqual(['attachments/a.png', 'attachments/b.png']);
  });

  it('words alone are unchanged', () => {
    expect(noteWithPictures('just words', '')).toBe('just words');
  });
});

describe('the card reads the pictures back out', () => {
  it('splits the words from the pictures', () => {
    expect(notePictures('make this bigger ![shot.png](attachments/a-shot.png)')).toEqual({
      words: 'make this bigger',
      pictures: [{ name: 'shot.png', src: 'attachments/a-shot.png' }],
    });
  });

  it('a note with no picture is all words', () => {
    expect(notePictures('the logo is too small')).toEqual({ words: 'the logo is too small', pictures: [] });
  });

  it('a link to a page is not a picture', () => {
    const text = 'see [the brief](docs/brief.md) and ![x](https://example.com/x.png)';
    expect(notePictures(text)).toEqual({ words: text, pictures: [] });
  });

  it('only pictures the app saved are drawn, not any path someone typed', () => {
    const text = '![key](/Users/someone/.ssh/id_rsa.png)';
    expect(notePictures(text).pictures).toEqual([]);
  });
});

describe('the file view wires it up', () => {
  const view = read('renderer/src/components/ArtifactView.tsx');
  const card = read('renderer/src/components/FileNoteCard.tsx');

  it('the note box takes a paste and a drop', () => {
    expect(view).toMatch(/aria-label="Note"[\s\S]{0,600}onPaste=/);
    expect(view).toMatch(/onDrop=/);
  });

  it('a picture is saved before the note is written, and goes in its text', () => {
    expect(view).toMatch(/persistAttachments\(/);
    expect(view).toMatch(/noteWithPictures\(/);
  });

  it('the card draws the pictures rather than the raw link', () => {
    expect(card).toMatch(/notePictures\(/);
  });
});
