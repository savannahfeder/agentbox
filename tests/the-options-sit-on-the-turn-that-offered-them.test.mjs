// THE OPTIONS AN AGENT OFFERED STAND AT THE FOOT OF THE TURN THAT OFFERED
// THEM, NOT AT THE FOOT OF THE WINDOW.
//
// Reported 2026-10-05 (w-560647d4db) with a screenshot of a thread: "right now
// all my chats have this stuck at the bottom. it should instead occur at the end
// of the turn/message where it occured, not stuck at the bottom. I'd want to see
// it on the turn where the agent is, let's say, 'return to me.' Once I've seen
// it as a user, I don't really want to see it continuously. It's been
// processed."
//
// The markup was inside `.dock-card`, the reply surface, which is docked and
// does not scroll. So one question asked once stood at the bottom of the window
// for as long as the thread was open: under the message that asked it, under
// everything that happened after it, and still there once it had been read.
//
// It is drawn in the pane now, after the agent's last word and after the threads
// that turn filed. Reading past it is what makes it go away.
//
// WHAT IS PINNED HERE is where it is drawn, because that is the whole of the
// report and it is the kind of thing a later edit moves back without noticing.
// A component that renders in the right place cannot be checked by rendering it
// alone, so this reads the source the way the other options tests do.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerIsLive } from '../renderer/src/format.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const focus = read('renderer/src/components/Focus.tsx');
const offer = read('renderer/src/components/OptionsOffer.tsx');
const css = read('renderer/src/styles.css');

describe('where the offer is drawn', () => {
  it('stands in the pane, above the reply surface', () => {
    const drawn = focus.indexOf('<OptionsOffer');
    const dock = focus.indexOf('<div className="focus-dock">');
    expect(drawn, 'the offer is not drawn at all').toBeGreaterThan(-1);
    expect(dock).toBeGreaterThan(-1);
    expect(drawn).toBeLessThan(dock);
  });

  it('is no longer inside the reply card', () => {
    const dock = focus.indexOf('<div className="focus-dock">');
    expect(focus.slice(dock)).not.toContain('opt-strip');
    expect(focus.slice(dock)).not.toContain('<OptionsOffer');
  });

  // THE TURN IT BELONGS TO. "Return to me" is the agent's last word plus the
  // threads that turn filed; the offer is the end of that, so it goes after
  // both rather than between them.
  it('comes after the threads that turn filed', () => {
    expect(focus.indexOf('<ThreadsMade')).toBeLessThan(focus.indexOf('<OptionsOffer'));
  });

  it('no longer waits on the reply box being open', () => {
    expect(focus).toMatch(/const stripShown = showOptions;/);
    expect(focus).not.toMatch(/const stripShown = showOptions && \(artifactView/);
  });

  it('keeps the one flag that also takes the list out of the message', () => {
    // Both the drawing and `cleanMessage` read `stripShown`/`showOptions`, so
    // the options can never be drawn here AND printed again in the message.
    expect(focus).toContain('{stripShown && (');
    expect(focus).toMatch(/showOptions && !!offered/);
  });
});

describe('the box it wears now that it is in the flow', () => {
  const rule = css.match(/\.opt-strip \{([^}]*)\}/s);

  it('has a box of its own, not just the dock’s top hairline', () => {
    expect(rule, 'no .opt-strip rule').toBeTruthy();
    expect(rule[1]).toMatch(/border: 1px solid var\(--line\)/);
    expect(rule[1]).not.toMatch(/border-bottom: 1px solid var\(--line\);/);
  });

  it('keeps the promise that the peek card never changes its height', () => {
    expect(rule[1]).toContain('position: relative');
    expect(css).toMatch(/\.opt-peek \{[^}]*position: absolute[^}]*bottom: 100%/s);
  });
});

describe('an offer stops being a control once it has been answered', () => {
  const withOptions = (fields) => ({ result: 'Which part next?\n\n## Options\n1. This one (recommended)\n2. That one', ...fields });

  it('is live while nothing has been said back', () => {
    expect(offerIsLive(withOptions({ wrote: { result: { ts: 10 } } }))).toBe(true);
  });

  it('goes quiet the moment a reply lands after it', () => {
    expect(offerIsLive(withOptions({ answer: 'option 1', wrote: { result: { ts: 10 }, answer: { ts: 20 } } }))).toBe(false);
  });

  // THE BOUNDARY THE OTHER SIDE: a reply from before the offer settles nothing,
  // which is the whole reason this is a timestamp test and not a truthiness one.
  it('stays live when the only reply is older than the offer', () => {
    expect(offerIsLive(withOptions({ answer: 'something else', wrote: { result: { ts: 30 }, answer: { ts: 5 } } }))).toBe(true);
  });

  it('is never a control on a turn that offered nothing', () => {
    expect(offerIsLive({ result: 'Shipped to main as 2ed0cce.', wrote: { result: { ts: 10 } } })).toBe(false);
  });
});

describe('the markup moved whole', () => {
  it('still offers the question, the chevron, the rows and the peek card', () => {
    for (const piece of ['opt-head', 'opt-collapse', 'opt-row', 'opt-peek', 'opt-key', 'opt-rec']) {
      expect(offer, `lost ${piece}`).toContain(piece);
    }
    expect(offer).toContain('recommended');
    expect(offer).toContain('↵ send');
  });
});
