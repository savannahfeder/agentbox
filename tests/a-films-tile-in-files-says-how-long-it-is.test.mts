// A FILM'S TILE IN FILES SAYS HOW LONG IT IS.
//
// Sofia asked for a film's tile to show a poster and its length. The poster was
// already drawn (FileCover's FilmCover, a frame 0.6 s in) and the cover already
// read the length and handed it up through onSize, but the Files tile kept it
// in a state it never drew: `const [, setSize] = useState('')`.
import { it, expect } from 'vitest';
import fs from 'node:fs';

it('the Files tile draws the length its cover reads', () => {
  const page = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
  expect(page).not.toMatch(/const \[, setSize\]/);
  expect(page).toMatch(/className="fp-length"/);
});
