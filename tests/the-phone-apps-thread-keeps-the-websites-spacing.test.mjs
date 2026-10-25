// Photographed beside the phone website, the phone app's thread sat 8px lower
// from its first message on, its "Show the N messages in between" sat 14px
// further under the message before it, and each option row was 3px taller.
// Measured from the words' boxes in both, against the website's computed styles:
// `.focus` pads 8px on top; `.opt-row` pads 7px top and bottom; `.thread-gap`
// has an 18px top margin that collapses into a turn's 16px bottom margin, where
// React Native adds the two; its line is 20.8px. The filed tasks' 6px bottom
// margin (`.made`) collapses into the options' 22px the same way, which put
// the options 7px low.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
const parts = fs.readFileSync('mobile/src/ui/ThreadParts.tsx', 'utf8');

describe("the phone app's thread keeps the website's spacing", () => {
  it('starts the conversation 8px under the top bar', () => {
    expect(screen).toMatch(/contentContainerStyle=\{\{ paddingHorizontal: size\.inset, paddingTop: 8,/);
  });

  it('pads each option row 7px above and below', () => {
    const row = parts.split('\n').find((l) => l.includes("flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 7, paddingHorizontal: 16"));
    expect(row).toMatch(/paddingBottom: 7\b/);
  });

  it("lets the fold's 18px margin take in a turn's 16px, as CSS margins collapse", () => {
    expect(screen).toMatch(/const endsTurn = n\.kind !== 'run' && n\.kind !== 'work' && thread\.turnEnds\[k\];/);
    expect(screen).toMatch(/style=\{\{ marginTop: endsTurn \? 18 - 16 : 18 \}\}/);
  });

  it('keeps 18px under a message that does not end a turn, and the fold line at 20.8px', () => {
    expect(screen).toMatch(/: 18 \}\}/);
    expect(screen).toMatch(/fontSize: 13, lineHeight: 20\.8, color: color\.faint \}\}>\{thread\.gapWords\}/);
  });

  it("lets the filed tasks' 6px bottom margin go into what follows, as CSS does", () => {
    expect(parts).toMatch(/inTurn \? \{ marginTop: 12 \} : \{ marginTop: 22 \}/);
    expect(parts).not.toMatch(/marginTop: 22, marginBottom: 6/);
  });
});
