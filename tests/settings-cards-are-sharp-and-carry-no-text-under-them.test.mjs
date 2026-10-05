// SETTINGS CARDS ARE SHARP, AND NO TEXT HANGS UNDER THEM (w-ccadd13c46, 2026-10-05).
//
// The first drawing of the redone settings screen came back as "better", with
// two notes: "in agentbox all borders are relatively sharp. these borders are
// quite rounded", and "there is a lot of text under components, gets a bit
// ugly. be more careful/deliberate with text, best not to have them
// outside/below components."
//
// Measured on that drawing: every card was 10px round against the app's 3px
// `--radius`, the badge was a 999px pill, and nine grey notes sat under cards
// across General, Claude Code, Running and Appearance (the keys pointer, the
// diagnostics footnote, the accounts hint, the permissions caveat, the running
// count, the outside-agents footnote, the theme dials note, the Claude Code
// path, and the "nowhere to send" line).
//
// What this holds: no corner on the screen is drawn rounder than `--radius`;
// a group takes no note at all, so nothing can be added under a card again
// without changing this; a warning about a group is drawn inside its card.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const css = read('renderer/src/components/settings.css');

describe('the corners', () => {
  it('draws every card with the app\'s own radius', () => {
    expect(css).toMatch(/\.set-plate:not\(\.set-keys\) \{[^}]*border-radius: var\(--radius\);/);
  });

  it('draws nothing on the screen rounder than that', () => {
    const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(radii.length).toBeGreaterThan(0);
    for (const r of radii) expect(r).toBe('var(--radius)');
  });
});

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
