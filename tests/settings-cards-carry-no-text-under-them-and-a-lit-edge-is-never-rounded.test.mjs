// SETTINGS CARDS CARRY NO TEXT UNDER THEM, A LIT EDGE IS NEVER ROUNDED, AND THE
// CONTROLS ARE THE APP'S OWN (w-ccadd13c46, 2026-10-05).
//
// Three rounds of notes on the redone settings screen, in order:
//
// 1. "there is a lot of text under components, gets a bit ugly ... best not to
//    have them outside/below components." Nine grey notes sat under cards.
// 2. "go back to the prev level of rounded corners for settings items, but
//    never round corners for something with a highlighted border (see image),
//    looks whack." The picture: the account in use wore a bright left rule that
//    ran to the card's edge, where the card's 10px corner bent it.
// 3. "Make the buttons and toggles much less ugly. And the - 3 + less ugly too
//    ... our standard ui with the orange etc is quite beautiful". The screen's
//    controls were its own: a white switch, a boxed three-cell stepper, a
//    filled button. The new-task card's are 28px hairline chips on a faint
//    wash, with the Send button in the accent orange (measured off the built
//    composer: `.tc-chip` 28 tall, 1px `--line`, `--tag-radius`; Send
//    `--accent`).
//
// What this holds: a group takes no note; a group's warning is inside its card;
// the card is 10px round; the account-in-use row is square, inset clear of the
// card's corners, and wears the app's selection bar; a switch that is on is the
// accent; buttons, the stepper and the dropdown are the composer's chip.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const css = read('renderer/src/components/settings.css');
/** A rule in settings.css, found by the end of its selector. */
const rule = (tail) => {
  const at = css.indexOf(`${tail} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('the text', () => {
  const group = settings.slice(settings.indexOf('const Group = ('), settings.indexOf('const Page = ('));

  it('gives a group no note, so nothing is drawn under a card', () => {
    expect(group).not.toMatch(/\bnote\b\s*[?:,}]/);
    expect(group).not.toContain('set-group-note');
    expect(settings).not.toMatch(/<Group[^>]*\snote=/);
  });

  it('draws a group\'s warning inside its card, as its first line', () => {
    const plate = group.slice(group.indexOf('<div className="set-plate">'));
    expect(plate.indexOf('set-row-warn')).toBeGreaterThan(-1);
    expect(plate.indexOf('set-row-warn')).toBeLessThan(plate.indexOf('{children}'));
  });

  it('keeps the Claude Code path, in a row of its own inside the status card', () => {
    expect(settings).toContain('{found && bin && <Row label="Runs from" desc={copy.where(bin)} />}');
  });

  it('keeps the running count, in the Agents at once sentence', () => {
    expect(settings).toContain("${w.running ? ` ${w.running} running now.` : ''}");
  });
});

describe('the corners', () => {
  it('rounds the card, at the 10px she asked to go back to', () => {
    expect(rule('.set-plate:not(.set-keys)')).toContain('border-radius: 10px;');
  });

  it('keeps the account in use square, inset clear of the card\'s corners', () => {
    const on = rule('.set-plate > .set-acct-row.on');
    expect(on).toContain('border-radius: 0;');
    expect(on).toMatch(/margin: 6px -10px;/);
    // The card's sides are 18px in, so the row stops 8px short of them.
    expect(rule('.set-plate:not(.set-keys)')).toContain('padding: 0 18px;');
  });

  it('wears the app\'s selection bar there, not a rule of its own', () => {
    expect(rule('.set-plate > .set-acct-row.on')).toContain('border-left: 2px solid var(--select-bar);');
  });

  it('rounds nothing that wears a highlighted edge', () => {
    // Every rule that draws a coloured edge on one side draws no curve.
    const blocks = css.split('}').filter((b) => /border-left:\s*\d+px solid var\(--(select-bar|accent)\)/.test(b));
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(b).toMatch(/border-radius: 0;/);
  });
});

describe('the controls are the new-task card\'s', () => {
  it('turns a switch on in the accent', () => {
    expect(rule('.set-sw.on')).toContain('background: var(--accent);');
  });

  it('draws a button as the composer\'s chip', () => {
    const ghost = rule('.settings-screen[data-pane] .set-ghost');
    expect(ghost).toContain('height: 28px;');
    expect(ghost).toContain('border: 1px solid var(--line);');
    expect(ghost).toContain('border-radius: var(--tag-radius);');
  });

  it('draws the stepper as two chips with the number between, and no box round them', () => {
    expect(rule('.settings-screen[data-pane] .set-step')).toContain('border: 0;');
    expect(rule('.settings-screen[data-pane] .set-step button')).toContain('border-radius: var(--tag-radius);');
    // The signs are drawn, not typed, so they are one size.
    const stepper = settings.slice(settings.indexOf('function Stepper('), settings.indexOf('function Picker<'));
    expect(stepper).not.toMatch(/>[−+]<\/button>/);
    expect((stepper.match(/<svg /g) ?? []).length).toBe(2);
  });

  it('draws the dropdown at the end of a row as the same chip', () => {
    expect(rule('.set-row-ctl .set-picker-now')).toContain('border-radius: var(--tag-radius);');
  });
});
