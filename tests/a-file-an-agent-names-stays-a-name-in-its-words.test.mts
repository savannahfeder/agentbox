// WHAT BROKE: an agent's answer that named a report printed the whole report
// under the message, a CSV as a table, and a PDF or deck as a 232px tile, all
// below a sentence that already linked each file by name. In a browser copy at
// 1600x1000 an answer naming one short report pushed the reply box off the
// first screen; naming a CSV crashed the thread outright (`onSide` was never
// defined in QueueFile).
//
// NOW, as the owner set it on w-658f249bb9: a file the agent wants read goes on
// a line of its own and opens beside the thread (besideDocument). Anything else
// stays the small linked name in the sentence. Pictures and films still draw in
// the message. People's own chats keep their tiles, which carry whether a file
// was delivered.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { besideDocument } from '../renderer/src/message-artifacts.ts';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const underTheMessage = focus.slice(focus.indexOf('{artifactSlot && <div className="inline-artifact"'), focus.indexOf('{!inlineArtifacts && htmlArtifacts.map('));

it('an agent thread draws no copy of a file under the message', () => {
  expect(underTheMessage).not.toContain('<QueueFile');
  expect(underTheMessage).not.toMatch(/\{page && inlineArtifacts[^\n]*<MessageFiles/);
  expect(focus).not.toMatch(/import \{[^}]*\bQueueFile\b[^}]*\} from '\.\/OneThingAtATime'/);
});

it('a chat between people keeps its file tiles', () => {
  expect(underTheMessage).toContain('{!page && inlineArtifacts && !previewSample && <MessageFiles product={product} paths={previewPaths}');
});

it('a name pressed in the words opens the newest edit of that file', () => {
  expect(focus).toMatch(/if \(goes === 'pane'\) \{ onOpenDoc\?\.\(newestOfFamily\(href, edits\)\); return; \}/);
  expect(focus).toMatch(/markdownActions\.current = \{[^}]*edits: item\.artifacts\?\.edits/);
});

it('a file the agent wants read still opens beside, and one named in a sentence does not', () => {
  expect(besideDocument('Signups dipped.\n\nreports/signup-dip.md')).toBe('reports/signup-dip.md');
  expect(besideDocument('The day-by-day numbers:\n\ndata/signups.csv')).toBe('data/signups.csv');
  expect(besideDocument('The full write-up is in reports/signup-dip.md.')).toBeNull();
  expect(besideDocument('The deck is in reports/q3.pdf.')).toBeNull();
});
