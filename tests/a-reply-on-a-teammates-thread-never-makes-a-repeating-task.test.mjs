// The power test of 2026-10-25: on a teammate's "Set up its job" thread the
// founder replied "fridays only at 4pm, name Weekly update, and the job is a
// five bullet summary". The reply box read the schedule words as "make this
// thread repeat", made a repeating task for Fridays at 8:00am in another
// project, and moved on; the teammate's own times never changed. A teammate
// keeps its own times (its duties), so on its threads the words go to it and
// nothing repeats.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('a schedule on a teammate\'s thread', () => {
  it('is not applied from a reply\'s words; the reply goes to the teammate', () => {
    expect(app).toMatch(/if \(repeat && !teammateIdOf\(focused\)\) applyRepeat\(focused, repeat\);\s*answerWith\(focused,/);
  });

  it('is refused from the Later menu, with where to say it instead', () => {
    const apply = app.slice(app.indexOf('const applyRepeat = async'), app.indexOf('const applyRepeat = async') + 1500);
    expect(apply).toMatch(/if \(teammateIdOf\(item\)\) \{ showToast\('A teammate keeps its own times\. Tell it when in its chat\.'\); return; \}/);
  });
});
