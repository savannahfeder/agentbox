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
    const drawn = focus.indexOf('{offerInPane && (');
    const dock = focus.indexOf('<div className="focus-dock">');
    expect(drawn, 'the offer is not drawn in the pane at all').toBeGreaterThan(-1);
    expect(dock).toBeGreaterThan(-1);
    expect(drawn).toBeLessThan(dock);
  });

  // THE ONE EXCEPTION, AND IT IS NOT THE REPORTED FAULT. With a document full
  // screen the pane's whole body is hidden and the dock is all that is on the
  // screen, so an offer drawn in the pane there would not be tastefully out of
  // the way — it would be unreachable, and answering a question would mean
  // leaving the document first. There it keeps its old home on the card, on its
  // old terms: up with the box, gone when the box folds. It follows nobody down
  // a page in that mode because no page of conversation is on the screen.
  it('is on the reply card only where the pane’s own body is hidden', () => {
    expect(focus).toContain("const fullScreenDoc = artifactView === 'focus';");
    expect(focus).toContain('const offerInPane = stripShown && !fullScreenDoc;');
    expect(focus).toContain('const offerInDock = stripShown && fullScreenDoc && replyOpen;');
    const dock = focus.indexOf('<div className="focus-dock">');
    // The dock's copy is the full-screen one and nothing else.
    expect(focus.slice(dock)).toContain('{offerInDock && (');
    expect(focus.slice(dock)).not.toContain('{offerInPane && (');
  });

  it('wears the card’s own edge there, not a second card inside the first', () => {
    expect(css).toMatch(/\.dock-card > \.opt-strip \{[^}]*margin: 0;[^}]*border-bottom: 1px solid var\(--line\)/s);
  });

  // THE TURN IT BELONGS TO. "Return to me" is the agent's last word plus the
  // threads that turn filed; the offer is the end of that, so it goes after
  // both rather than between them.
  it('comes after the threads that turn filed', () => {
    expect(focus.indexOf('<ThreadsMade')).toBeLessThan(focus.indexOf('{offerInPane && ('));
  });

  it('no longer waits on the reply box being open', () => {
    expect(focus).toMatch(/const stripShown = showOptions;/);
    expect(focus).not.toMatch(/const stripShown = showOptions && \(artifactView/);
  });

  it('keeps the one flag that also takes the list out of the message', () => {
    // `stripShown` stays the whole question of whether there IS an offer, which
    // is what `cleanMessage` reads; where it is drawn is the two flags below it.
    // Narrowing `stripShown` to one of them would print the options twice.
    expect(focus).toMatch(/showOptions && !!offered/);
    expect(focus).toMatch(/const offerInPane = stripShown &&/);
    expect(focus).toMatch(/const offerInDock = stripShown &&/);
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
  // The chevron is no longer among them: the fold went when the block stopped
  // standing over the composer (w-2e13752a85, the-options-are-never-folded-away).
  it('still offers the question, the rows and the peek card', () => {
    for (const piece of ['opt-head', 'opt-row', 'opt-peek', 'opt-key', 'opt-rec']) {
      expect(offer, `lost ${piece}`).toContain(piece);
    }
    expect(offer).toContain('recommended');
    expect(offer).toContain('↵ send');
  });
});
