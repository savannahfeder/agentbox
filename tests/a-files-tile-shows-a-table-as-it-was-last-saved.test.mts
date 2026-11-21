// A FILES TILE SHOWS A TABLE AS IT WAS LAST SAVED.
//
// Both synthetic testers on 2026-11-21 (w-a1c984116b) edited a table, closed
// it, and its tile in Files still showed the rows from before. A table saves
// over its own file, so the path the tile read from never changed, and the
// tile only read the file again when the path did.
//
// What must hold: a tile reads its file again when its version count or size
// moves, whatever the path, for tables and code, pages and documents alike.
// Not its time: measured in the app, a table saved twice kept the same `at`.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
const face = (name: string) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));

for (const name of ['DocFace', 'PageFace', 'CodeFace']) {
  it(`${name} reads its file again when it changes in place`, () => {
    expect(face(name)).toMatch(/\}, \[file\.opened, file\.versions, file\.bytes[,\]]/);
  });
}
