// A card for another thread sat on the Reply box of the thread being read.
// Measured on Dev's screenshot at 1440 x 900: the card ran from y=645 to y=878 and the box from
// y=811 to y=854, overlapping its right 440 px. The card now stands on top of the box.
// It also drew a two-line issue body as one line with a literal \n, and called the asker
// "Company", the project, not the thread that was asking.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardPlace, CARD_FOOT, SIDE_GAP } from '../renderer/src/room-for-the-card.ts';
import { approvalReads, approvalAsker, approvalShown } from '../renderer/src/approval-card.ts';

const card = { left: 978, right: 1418, height: 233 };
const VIEW = 900;

describe('where the card stands', () => {
  it('stands above a Reply box it would have covered', () => {
    expect(cardPlace(card, [{ left: 280, right: 1165, top: 811, bottom: 854 }], VIEW).lift).toBe(VIEW - 811 + 8);
  });

  it('stands in its corner with nothing to type in', () => {
    expect(cardPlace(card, [], VIEW).lift).toBe(CARD_FOOT);
  });

  it('stays in its corner when the box ends one pixel left of it', () => {
    expect(cardPlace(card, [{ left: 280, right: 978, top: 811, bottom: 854 }], VIEW).lift).toBe(CARD_FOOT);
  });

  it('narrows rather than moves when the box reaches one pixel under it', () => {
    expect(cardPlace(card, [{ left: 280, right: 979, top: 811, bottom: 854 }], VIEW)).toEqual({ lift: CARD_FOOT, width: 1418 - 979 - SIDE_GAP });
  });

  it('stays in its corner when the box is wholly above it', () => {
    expect(cardPlace(card, [{ left: 280, right: 1165, top: 100, bottom: 140 }], VIEW).lift).toBe(CARD_FOOT);
  });

  it('never climbs off the top of the window', () => {
    expect(cardPlace({ ...card, height: 800 }, [{ left: 280, right: 1165, top: 300, bottom: 854 }], VIEW).lift).toBe(VIEW - 800 - 8);
  });

  it('ignores a box with no size, which is not on screen', () => {
    expect(cardPlace(card, [{ left: 0, right: 0, top: 0, bottom: 0 }], VIEW).lift).toBe(CARD_FOOT);
  });
});

describe('what counts as a box you type in', () => {
  // Seen on screen: a thread's Reply box is a button until pressed, so the card stayed on it.
  it('includes the folded Reply box', () => {
    expect(fs.readFileSync(new URL('../renderer/src/room-for-the-card.ts', import.meta.url), 'utf8')).toContain('.dock-pill');
    expect(fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8')).toContain('dock-pill');
  });
});

describe('what the card says', () => {
  it('breaks lines where the agent broke them', () => {
    const shown = approvalShown(approvalReads({ body: 'Steps:\n1. Open it.' }, 'mcp__Test tracker__create_issue').body, 'mcp__Test tracker__create_issue');
    expect(shown).toContain('body: "Steps:\n1. Open it."');
    expect(shown).not.toContain('\\n');
  });

  it('still shows every other hidden character, so a yes is about what it says', () => {
    const shown = approvalShown(approvalReads({ a: 'x\ty\u0000', b: 'back\\nslash' }, 'mcp__s__t').body, 'mcp__s__t');
    expect(shown).toContain('x\\ty\\u0000');
    expect(shown).toContain('back\\\\nslash');
  });

  it('shows a card that is not a tool call exactly as it came', () => {
    expect(approvalShown('echo "a\\nb"', 'Bash')).toBe('echo "a\\nb"');
  });

  it('names the thread that asks', () => {
    expect(approvalAsker('Onboarding clinic save bug', 'Company')).toBe('Onboarding clinic save bug');
  });

  it('falls back on the project when the thread is not known', () => {
    expect(approvalAsker(null, 'Company')).toBe('Company');
  });
});
