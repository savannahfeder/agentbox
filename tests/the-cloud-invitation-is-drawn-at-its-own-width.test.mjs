// THE CLOUD INVITATION IS DRAWN AT ITS OWN WIDTH.
//
// The card the cloud button opens before anyone has signed in was designed at
// 360px (`.th-cloud-invite`). It also wears `.th-pop.th-cloud-pop`, whose
// 540px is for the full cloud menu, and two classes beat one: in the app's
// preview (?fixtures&cloud=new, 1512px window) the card measured 540px wide,
// three short lines floating in a slab. The owner: "this card feels a little
// wider than it needs to be" (w-2c627fdea8, 2026-10-23).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const pages = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');

/** Every rule whose selector list names `selector` exactly, in file order. */
function rulesFor(selector) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(pages))) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (selectors.includes(selector)) out.push({ at: m.index, body: m[2] });
  }
  return out;
}
const widthIn = (body) => /(?:^|;)\s*width:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? null;

describe('the cloud invitation', () => {
  const menu = rulesFor('.th-pop.th-cloud-pop').find((r) => widthIn(r.body));
  const invite = rulesFor('.th-pop.th-cloud-invite').find((r) => widthIn(r.body));

  it('the full cloud menu is still 540px wide', () => {
    expect(widthIn(menu.body)).toBe('540px');
  });
  it('the invitation sets its 360px with the same weight as the menu rule', () => {
    expect(invite, 'no .th-pop.th-cloud-invite rule sets a width').toBeTruthy();
    expect(widthIn(invite.body)).toBe('360px');
  });
  it('and comes after it, so the invitation wins', () => {
    expect(invite.at).toBeGreaterThan(menu.at);
  });
  it('a lone .th-cloud-invite width, which the menu rule beats, is gone', () => {
    expect(rulesFor('.th-cloud-invite').some((r) => widthIn(r.body))).toBe(false);
  });
});
