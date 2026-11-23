// A CODE REFERENCE KEEPS ITS FOLDER (w-34443a206b).
//
// Two power testers on 2026-11-22 saw it five times: an agent wrote
// `src/server.js:21` and the thread drew server.js:21. A mention shows only a
// file's name, which suits a page or a picture, but in code the folder is what
// tells two server.js or index.ts apart, and the hover is the only place it
// was left. Measured on mentionName and mentionLabel, which the window and the
// phone both draw a mention's words with.
import { describe, expect, it } from 'vitest';
import { mentionLabel, mentionName } from '../renderer/src/mentions.ts';

describe('a code reference written with its folder', () => {
  it('shows the folder, the file and the line', () => {
    expect(mentionName('src/server.js:21')).toBe('src/server.js:21');
    expect(mentionName('renderer/src/App.tsx:12')).toBe('renderer/src/App.tsx:12');
    expect(mentionName('main/x.mjs#L40')).toBe('main/x.mjs#L40');
    expect(mentionName('src/cart.ts:2-5')).toBe('src/cart.ts:2-5');
  });

  it('drops only a leading ./', () => {
    expect(mentionName('./src/view.tsx')).toBe('src/view.tsx');
  });

  it('as a link whose words are the path, keeps the words', () => {
    expect(mentionLabel('src/server.js#L21', 'src/server.js:21')).toBe('src/server.js:21');
    expect(mentionLabel('src/server.js', 'src/server.js')).toBe('src/server.js');
  });
});

describe('what still goes by its name alone', () => {
  it('a code file with no folder', () => {
    expect(mentionName('cart.mjs:2')).toBe('cart.mjs:2');
  });

  it('a code file written from the root, which is a machine path', () => {
    expect(mentionName('/repo/cart.py#L12')).toBe('cart.py#L12');
  });

  it('a page, a document or a picture', () => {
    expect(mentionName('legal/privacy.html')).toBe('privacy.html');
    expect(mentionName('docs/notes.md')).toBe('notes.md');
    expect(mentionName('designs/w-3a/shot.png')).toBe('shot.png');
  });

  it('words the worker chose for a code link', () => {
    expect(mentionLabel('src/server.js', 'server.js')).toBe('server.js');
    expect(mentionLabel('src/server.js', 'the server')).toBeNull();
  });
});
