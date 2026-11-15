// NOTHING IS QUOTED ABOVE THE MESSAGE.
//
// The reading pane used to open with a grey box headed "IN RESPONSE TO · 27M
// AGO" naming the row this one answers. It is left over from a much earlier
// pane that stacked three such boxes, and what it says is already on the
// screen: the parent's words open the thread as its first message, the title
// is in the breadcrumb, and the message below restates the ask. It is gone,
// and this keeps it gone.
//
// What stays is the part that was never that box: the user's own words at the
// top of the THREAD (`openingSaid`), which recapFor still works out.
//
// This replaces tests/nothing-quotes-her-back-above-a-message, which held the
// box to quoting nobody. There is no box to hold.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recapFor } from '../renderer/src/recap';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const focus = read('components', 'Focus.tsx');
const css = read('styles.css');

const row = (over = {}) => ({
  id: 'w-1', product: 'p', productName: 'P', status: 'blocked', title: 'A title',
  kind: 'question', labels: [], priority: 0, epoch: 0, claim: null,
  createdAt: 1000, updatedAt: 2000, ...over,
});

describe('the box above the message', () => {
  it('is not drawn, and there is no component left to draw it', () => {
    expect(focus).not.toMatch(/In response to/i);
    expect(focus).not.toMatch(/function Recap\(/);
    expect(focus).not.toMatch(/<Recap\b/);
  });

  it('has no styles left behind either', () => {
    expect(css).not.toMatch(/\.origin\b/);
    expect(css).not.toMatch(/\.origin-(label|title|open|oneline)\b/);
  });

  it('has no shape left in recap.ts for a caller to find and draw again', () => {
    // An agent parent she never answered was the only thing that box was for.
    const parent = row({ id: 'w-0', kind: 'question', title: 'The earlier ask', body: 'a long agent message', updatedAt: 2500 });
    expect(recapFor(row(), parent)).toBeNull();
    expect(read('recap.ts')).not.toMatch(/'origin'|'replied'/);
  });
});

describe('what the box was standing in front of is still there', () => {
  it('the parent\'s own words still open the thread', () => {
    const parent = row({ id: 'w-0', title: 'The earlier ask', answer: 'do the first one', wrote: { answer: { ts: 3000, source: 'founder' } } });
    expect(recapFor(row({ createdAt: 3500 }), parent)).toEqual({
      kind: 'said', text: 'do the first one', at: 3000, on: 'The earlier ask',
    });
    expect(focus).toMatch(/const openingSaid = !agent && said\?\.kind === 'said'/);
    expect(focus).toMatch(/opening=\{openingSaid\}/);
  });

  it('a reply on this row still keeps the parent out of the thread', () => {
    const parent = row({ id: 'w-0', title: 'The earlier ask', answer: 'do the first one' });
    const item = row({ answer: 'yes, go ahead', wrote: { answer: { ts: 5000, source: 'founder' } } });
    expect(recapFor(item, parent)).toBeNull();
  });

  it('and the parent is still one click away, from the thread', () => {
    expect(focus).toMatch(/onOpenOrigin=\{\(\) => parent && onOpenItem\(parent\)\}/);
  });
});
