// WHAT BROKE: the import card that ends setup ("Bring in your recent agents")
// was drawn dimmed, its words and its orange button greyed like the app behind
// it. Setup draws its own veil over the whole app at z-index 299, and the card
// sits on the ordinary modal backdrop at z-index 40, so the veil lay ON TOP of
// the card. Measured in the built renderer: at the card's heading,
// document.elementFromPoint hit the card but the .fr-veil covered the same
// point above it, and the screenshot of that step showed the card at the same
// dim as the inbox behind it. The ⌘K import card, which has no veil, was fine.
//
// NOW: inside setup the card's backdrop sits over the veil and under setup's
// way out, and setup does not draw a second veil under a card that already
// dims the app with its own backdrop.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../renderer/src/' + p, import.meta.url), 'utf8');
const css = read('styles.css');
const card = read('components/ImportAgents.tsx');
const walk = read('components/Onboarding.tsx');

// The z-index of the first rule whose selector is exactly `sel`.
const z = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`^${esc}\\s*\\{[^}]*?z-index:\\s*(\\d+)`, 'm'));
  if (!m) throw new Error(`no z-index for ${sel}`);
  return Number(m[1]);
};

describe('the import card at the end of setup is above the veil', () => {
  it('its backdrop is marked as the walk\'s when the walk opens it, and only then', () => {
    expect(card).toMatch(/className=\{`modal-backdrop compose-backdrop\$\{walk \? ' in-walk' : ''\}`\}/);
  });

  it('sits over setup\'s veil', () => {
    expect(z('.modal-backdrop.in-walk')).toBeGreaterThan(z('.fr-veil'));
  });

  it('stays under setup\'s way out and the question it asks', () => {
    const above = z('.modal-backdrop.in-walk');
    expect(above).toBeLessThan(z('.fr-out'));
    expect(above).toBeLessThan(z('.fr-back'));
    expect(above).toBeLessThan(z('.fr-stay-scrim'));
    expect(above).toBeLessThan(z('.toast'));
  });

  it('leaves every other card where it was, ⌘K\'s import card included', () => {
    expect(z('.modal-backdrop')).toBe(40);
  });
});

describe('setup does not dim the app twice under it', () => {
  const finished = walk.slice(walk.indexOf('function Finished('));
  const importBranch = finished.slice(finished.indexOf('if (!card.blocked) {'), finished.indexOf('<ImportAgents'));
  const gateBranch = finished.slice(finished.indexOf('<ImportAgents'));

  it('draws no veil before the import card', () => {
    expect(importBranch.length).toBeGreaterThan(0);
    expect(importBranch).not.toMatch(/<Veil\b/);
  });

  // THE GATE STOPPED WEARING THE ENDING'S PANEL, AND THE VEIL IS STILL ITS OWN
  // (w-ce8c1a9275). This read for `card.blocked ? 'fr-finish gate'`, the ternary
  // that used to pick between the gate and an ending card in one div. The gate
  // is now its own question screen -- `fr-stack fr-stack-folders`, like the
  // walk's other full-stop screens -- and there is no ending card left to
  // choose against, so that ternary is gone on purpose. What this test is for
  // is unchanged and still checked: the gate dims the app with setup's veil,
  // because unlike the import card it has no backdrop of its own, and it dims
  // it exactly once.
  it('still draws the veil under the gate card, which has no backdrop of its own', () => {
    expect(gateBranch).toMatch(/<Veil box=\{null\} \/>\s*<div className="fr-stack fr-stack-folders"/);
    expect(gateBranch.match(/<Veil\b/g)).toHaveLength(1);
  });
});
