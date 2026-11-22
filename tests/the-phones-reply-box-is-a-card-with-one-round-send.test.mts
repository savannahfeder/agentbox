// THE PHONE'S REPLY BOX IS A CARD WITH ONE ROUND SEND (2026-11-22). The reply
// box was a 6px-cornered outline flush on the page, its choices a dotted
// sentence ("Medium priority. In Auto Mode. On Opus 5.5.") over a hairline, and
// Send a 29px outlined word joined to a caret. Part of "a redesign of
// everything". Measured by reading the thread screen and ui/parts.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const thread = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const box = thread.slice(thread.indexOf('const card = {'), thread.indexOf('{/* Stop takes Send\'s place'));
const piece = (from: string) => parts.slice(parts.indexOf(from), parts.indexOf('\n}\n', parts.indexOf(from)));

describe('the reply box', () => {
  it('is a white card lifted off the page, round at card size, folded or open', () => {
    expect(box).toMatch(/const card = \{ borderRadius: 26, backgroundColor: color\.card, borderWidth: 1, borderColor: color\.line, \.\.\.lift\('card'\) \}/);
    expect(box.match(/\.\.\.card/g)!.length).toBe(2);
  });
  it('has no line between the words and the buttons under them', () => {
    expect(box).not.toMatch(/borderTopWidth/);
  });
  it('offers priority, mode and model as three chips, each saying what it is to a screen reader', () => {
    expect(box).toMatch(/said=\{`Priority: \$\{priorityWord\}`\}/);
    expect(box).toMatch(/said=\{`Mode: \$\{modeWord\}`\}/);
    expect(box).toMatch(/said=\{`Model: \$\{modelLabel\}`\}/);
    expect(box).not.toMatch(/sentenceWord/);
  });
  it('sends from one round filled key, with Send later beside it', () => {
    expect(box).toMatch(/<SendKey disabled=\{busy \|\| !ready\} busy=\{busy\} onPress=\{sendByHand\} \/>/);
    expect(box).toMatch(/accessibilityLabel=\{sendsAt \? `Sends \$\{laterHint\(sendsAt\)\}\. Change when` : 'Send later'\}/);
  });
  it('still gives Stop that slot while the agent works and nothing is typed', () => {
    expect(box).toMatch(/\{offers\.stop && !ready \? stopButton : \(/);
  });
});

describe('a choice in a box', () => {
  const chip = piece('export function ChoiceButton(');
  it('is a chip a thumb can hit, not a dotted word', () => {
    expect(chip).toMatch(/height: 32/);
    expect(chip).toMatch(/borderRadius: corner\.pill/);
    expect(chip).not.toMatch(/textDecorationLine/);
    expect(chip).toMatch(/accessibilityLabel=\{said\}/);
  });
});

describe('the send key', () => {
  const key = piece('export function SendKey(');
  it('is a filled disc that says Send, dimmed while it cannot', () => {
    expect(key).toMatch(/width: 36, height: 36, borderRadius: 18, [^\n]*backgroundColor: color\.graphite/);
    expect(key).toMatch(/accessibilityLabel=\{busy \? 'Sending…' : label\}/);
    expect(key).toMatch(/opacity: disabled \? 0\.3 : /);
  });
});
