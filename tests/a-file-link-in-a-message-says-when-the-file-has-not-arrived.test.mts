// A FILE LINK IN A MESSAGE SAYS WHEN THE FILE HAS NOT ARRIVED (w-f702d60afe, round seven, 2026-11-20).
//
// The backend tester opened a task Lena handed him and pressed "Open the dark
// mode spec" in its words: "The handoff stays on screen with no document visible
// after clicking the link." The link had been pointed at the copy the task
// carried (main/team giveTask), and that copy was still crossing from Lena's
// computer. A file with a tile says so on the tile (MessageFiles.tsx); a file
// named inside the words had nothing. Now a link to a file in a conversation
// says the same thing beside it while it is not there: on its way, waiting for
// whose computer, or not delivered. Sent and arrived files say nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const link = focus.slice(focus.indexOf('export function ArtifactLink('), focus.indexOf('\n}\n', focus.indexOf('export function ArtifactLink(')));

describe('a file named in a message', () => {
  it('draws where it is beside the link', () => {
    expect(link).toMatch(/<InlineCarry src=\{src\} \/>/);
  });
  it('says nothing once it is sent or there', () => {
    const inline = focus.slice(focus.indexOf('function InlineCarry('), focus.indexOf('\n}\n', focus.indexOf('function InlineCarry(')));
    expect(inline).toMatch(/if \(!said \|\| said\.state === 'sent'\) return null;/);
  });
});
