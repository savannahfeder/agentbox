// N ON THE TUTORIAL'S LAST CARD STARTS A THREAD (w-fbe5e95dea, 2026-11-10).
//
// The last card says "Next, start a real thread. Press N". Both round-five
// testers pressed N and got no thread. Driving a copy to that card: it ends on
// Home with the New thread box already focused, so N typed an "n" into it. The
// card now takes N itself and starts the thread the way the N key does
// everywhere else (focus Home's box, or open the New thread box).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const ob = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe("the tutorial's last card", () => {
  it('takes a plain N and starts a thread', () => {
    const landed = ob.slice(ob.indexOf('export function Landed'), ob.indexOf('export function Landed') + 2500);
    expect(landed).toMatch(/onNew/);
    expect(landed).toMatch(/\(e\.key === 'n' \|\| e\.key === 'N'\) && !e\.metaKey && !e\.ctrlKey && !e\.altKey/);
    expect(landed).toMatch(/e\.preventDefault\(\)/);
  });
  it('is handed the same start the N key uses', () => {
    expect(app).toMatch(/<Landed [^\n]*onNew=\{startThread\}/);
  });
});
