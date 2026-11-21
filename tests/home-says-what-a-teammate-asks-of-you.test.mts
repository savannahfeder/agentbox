// HOME SAYS WHAT A TEAMMATE ASKS OF YOU (w-f702d60afe, round eight, 2026-11-20).
//
// The designer tester on Home: "the cards do not say who is asking or when they
// need an answer". Photographed on Theo's Home with Sam's help ask waiting: the
// card read only "SAM" under the thread's name, where the inbox row reads "Sam
// asks for help". Home now says the same.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const home = app.slice(app.indexOf('const homeNeeds: NeedsRow[]'), app.indexOf('const homeTeam'));

describe("Home's card for an ask", () => {
  it('says what is asked after who asks', () => {
    expect(home).toMatch(/const asks = from && i\.ask && i\.assignee === team\?\.me && !ended \? \(i\.ask\.kind === 'help' \? ' asks for help' : ' asks for a review'\) : '';/);
    // A closed ask says how it ended instead (tests/an-ask-is-sent-once-and-ends-in-words-that-say-how).
    expect(home).toMatch(/from: ended \?\? \(from \? `\$\{from\}\$\{asks\}` : null\)/);
  });
});
