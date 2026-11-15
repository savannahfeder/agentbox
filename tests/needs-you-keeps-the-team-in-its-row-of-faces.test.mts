// NEEDS YOU KEEPS THE TEAM IN ITS ROW OF FACES.
//
// The panel of people, AI teammates and groups beside Needs you came back on
// 2026-11-02 and went again the same day, in the owner's words: "i don't find
// this component on the right here super helpful. is it just entry points into
// chats? maybe we should bring back the old way". It was: each row only opened
// that member's page. The row of faces on the tab line does that in less room.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

it('draws the faces row and no panel beside the list', () => {
  const app = read('renderer/src/App.tsx');
  expect(app).toMatch(/<NeedsFaces /);
  expect(app).not.toMatch(/NeedsRail|nr-home|railShown/);
  expect(read('renderer/src/team/everything/everything.css')).not.toMatch(/\.nr-rail/);
});
