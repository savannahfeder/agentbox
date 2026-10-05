// MARGARETTE WANDERED, AND SHE WAS NOT LOST.
//
// She is the least technical person the founder has interviewed and the first
// outside the building to walk the onboarding. The note off it, verbatim:
//
// And from the call, which is the half that decides what this is rather than
// only whether it happens:
//
// So she READ the card and went somewhere else anyway, out of curiosity, and
// the card that would have called her back was in a corner she looked at
// second. Two things follow and this file holds both.
//
// THE CLICK IS HELD, exactly the way a wrong key already is.`swallowPress` is
// that rule for a key and `strayClick` is the same sentence with the word click
// in it. It is ONE rule, not two: what is allowed is what the ring is round,
// read off `ANCHOR` rather than off a second list of selectors.
//
//   AND THE WALK ANSWERS HER. A click that does nothing at all is a dead app,
//   and a dead app is its own kind of confusing. The answer is the one this
//   walk already has, in three parts and no words: the veil deepens so what she
//   reached for goes quiet, the ring swells once so the thing to press does
//   not, and the cap pulses exactly as it does for a wrong key. No modal, no
//   scold, no alarm colour, and no third line on any card.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALSO, ANCHOR, COACHED, HELD_EVENTS, IN_PRACTICE, NOT_THE_APP, NOT_THE_WALK,
  WRONG_MS, coach, practising, strayClick,
} from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const onboarding = read('renderer/src/components/Onboarding.tsx');
const focus = read('renderer/src/components/Focus.tsx');
const css = read('renderer/src/styles.css');
/**
 * The source without its essays. Everything asserted here is wiring, and every
 *  paragraph beside it quotes somebody at length — several of them quote the
 *  very thing being asserted absent, so matching the prose would pass forever.
 *  This is the same guard `her-way-out-of-the-walk-really-works` uses. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(onboarding);
const cssCode = strip(css);
/** One rule out of the stylesheet, by selector. */
const rule = (sel) => {
  const at = cssCode.indexOf(`${sel} {`);
  expect(at, `there is no ${sel} rule`).toBeGreaterThan(-1);
  return cssCode.slice(at, cssCode.indexOf('}', at));
};
/** One @keyframes block, by name. */
const frames = (name) => {
  const at = cssCode.indexOf(`@keyframes ${name} {`);
  expect(at, `there is no ${name} keyframes`).toBeGreaterThan(-1);
  return cssCode.slice(at, cssCode.indexOf('\n}', at));
};

/**
 * A STAND-IN FOR A DOM NODE, because this repo has no jsdom and the thing
 *  under test is the RULE rather than a browser's selector matching. It walks
 *  up a chain comparing each simple selector verbatim, so dropping `.fr-out`
 *  out of `NOT_THE_APP` fails these whatever else changes. */
const node = (is, parent = null) => ({
  is,
  parent,
  closest(sel) {
    const want = sel.split(',').map((s) => s.trim());
    for (let n = this; n; n = n.parent) if (want.includes(n.is)) return n;
    return null;
  },
  contains(other) {
    for (let n = other; n; n = n.parent) if (n === this) return true;
    return false;
  },
});

describe('1. what the beat is about is what the ring is round', () => {
  const plus = node('button[aria-label="New task"]', node('.top-bar'));
  const insidePlus = node('svg', plus);

  it('the thing being pointed at takes the click, and so does anything inside it', () => {
    expect(strayClick(plus, [plus])).toBe(false);
    expect(strayClick(insidePlus, [plus])).toBe(false);
  });

  it('and everything else on the screen is held', () => {
    const otherRow = node('.row', node('.list-pane'));
    const someTab = node('.tab', node('.tabs'));
    const railThing = node('.rail-project', node('.rail'));
    for (const el of [otherRow, someTab, railThing]) {
      expect(strayClick(el, [plus])).toBe(true);
    }
  });

  it('a beat with a second thing its own card names takes that too', () => {
    const strip = node('.opt-strip', node('.focus-dock'));
    const replyBox = node('.dock-pill', node('.focus-dock'));
    expect(strayClick(replyBox, [strip])).toBe(true);
    expect(strayClick(replyBox, [strip, replyBox.parent])).toBe(false);
  });

  it('and it is read off ANCHOR rather than off a second list of selectors', () => {
    // The point of the whole design: the ring and the lock cannot disagree,
    // because they are handed the same element. If `strayClick` ever grew a
    // selector list of its own this is what would catch it.
    expect(strayClick.length).toBe(2);
    const src = strip(read('renderer/src/onboarding.ts'));
    const body = src.slice(src.indexOf('export function strayClick'));
    const fn = body.slice(0, body.indexOf('\n}'));
    expect(fn).not.toMatch(/querySelector/);
    expect(fn).not.toMatch(/\.list-pane|\.tabs|\.rail|button\[/);
    // And the component hands it what it already resolved for the ring.
    expect(code).toMatch(/firstOf\(selector\),/);
    expect(code).toMatch(/strayClick\(e\.target, live\)/);
  });

  it('every beat the lock covers really has something to point at', () => {
    // A beat with no anchor would hold everything and answer nothing, which is
    // the dead app. IN_PRACTICE is the lock's scope; ANCHOR is what it holds to.
    for (const step of IN_PRACTICE) {
      expect(ANCHOR[step], `${step} has no anchor`).toBeTruthy();
      expect(ANCHOR[step].length, `${step} has an empty anchor`).toBeGreaterThan(0);
    }
  });

  /* * AND AN ENTRY IN THE MAP IS NOT THE SAME AS A THING ON THE SCREEN (w-175e109e7c,
     2026-09-01). Nothing joined the two edits up, so the walk kept pointing at it, `Ringed`
     ended `if (!geo) return null`, and the beat drew no ring, no sentence and no lock at
     all.

     The tests of that beat did not catch it because they BUILT the button:
     `node('.focus-resolve', node('.focus-actions'))`, a fixture that will go on
     existing however much of the app is deleted underneath it. So this asks the
     app instead. Every name the walk points at has to appear in the app's own
     source, and the walk's own two files are not part of that source: matching
     them would be the map agreeing with itself.
  */
  it('and every name it points at is one the app still draws', () => {
    const dir = path.join(root, 'renderer', 'src');
    const walk = ['onboarding.ts', path.join('components', 'Onboarding.tsx')]
      .map((p) => path.join(dir, p));
    const files = [];
    const sweep = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) sweep(p);
        else if (/\.tsx?$/.test(e.name) && !walk.includes(p)) files.push(p);
      }
    };
    sweep(dir);
    const app = files.map((p) => fs.readFileSync(p, 'utf8')).join('\n');

    // A selector is a run of class names, tag names and attributes. What the
    // app has to still carry is each NAME in it, which is what goes stale when
    // a control is deleted: `.focus-actions` outlived `.focus-resolve` by five
    // days and the pair of them was the anchor.
    const names = (sel) => [
      ...[...sel.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]),
      ...[...sel.matchAll(/\[([\w-]+)="([^"]+)"\]/g)].map((m) => `${m[1]}="${m[2]}"`),
    ];
    const every = [
      ...Object.entries(ANCHOR).map(([step, sels]) => [`ANCHOR.${step}`, sels]),
      ...Object.entries(ALSO).map(([step, sels]) => [`ALSO.${step}`, sels]),
    ];
    for (const [where, sels] of every) {
      for (const sel of sels) {
        for (const name of names(sel)) {
          expect(app.includes(name), `${where} points at "${sel}" and nothing in the app draws "${name}"`).toBe(true);
        }
      }
    }
  });

  it('and the button the answer beat used to ring is gone from both', () => {
    // The two halves of the same fault, so neither can come back alone. She
    // took the button out; putting it back to make the walk work would be
    // undoing her answer to make ours easier.
    expect(focus).not.toMatch(/focus-resolve/);
    expect(css).not.toMatch(/focus-resolve/);
    expect(JSON.stringify(ANCHOR)).not.toMatch(/focus-resolve/);
    // And the beat rings the box that IS on the screen.
    expect(ANCHOR.answer).toEqual(['.focus-dock .dock-card', '.focus-dock']);
    expect(focus).toMatch(/className="dock-card"/);
  });
});

describe('2. four things are never held, and each costs somebody something', () => {
  it('a field, which is the keyboard\'s own rule', () => {
    // Beat ten has the compose card open with her task already in it, and
    // `pressCounts` has said since 08-27 that a key typed into a field is not a
    // key at the walk. A click into one is not a click at the walk either.
    expect(NOT_THE_WALK).toContain('input');
    expect(NOT_THE_WALK).toContain('textarea');
    expect(NOT_THE_WALK).toContain('[contenteditable="true"]');
    expect(strayClick(node('input'), [node('.anything')])).toBe(false);
    expect(strayClick(node('textarea'), [node('.anything')])).toBe(false);
  });

  it('the way out, and the card it opens', () => {
    expect(NOT_THE_APP).toContain('.fr-out');
    expect(NOT_THE_WALK).toContain('.fr-stay-scrim');
    expect(strayClick(node('.fr-out'), [node('.anything')])).toBe(false);
    const inTheCard = node('button', node('.fr-stay-scrim'));
    expect(strayClick(inTheCard, [node('.anything')])).toBe(false);
  });

  it('the walk\'s own furniture, which has nothing under it to hold', () => {
    for (const it of ['.fr-tether', '.fr-ring', '.fr-veil', '.fr-band']) {
      expect(NOT_THE_APP).toContain(it);
      expect(strayClick(node('span', node(it)), [node('.anything')])).toBe(false);
    }
  });

  it('and a beat with nothing drawn to point at holds nothing at all', () => {
    // A click that does nothing, with nothing on the screen saying where to go
    // instead, is the dead app this whole round is trying not to be.
    expect(strayClick(node('.row'), [])).toBe(false);
    expect(strayClick(node('.row'), [null, undefined])).toBe(false);
    // And the component asks the same question about the ring itself, so a
    // frame with no ring drawn on it never swallows anything.
    expect(code).toMatch(/if \(!drawn\.current\) return;/);
    expect(code).toMatch(/drawn\.current = !!geo;/);
  });

  it('a target that is not an element at all is not the walk\'s business', () => {
    expect(strayClick(null, [node('.anything')])).toBe(false);
    expect(strayClick({}, [node('.anything')])).toBe(false);
  });
});

describe('3. the scope is the practice band and nothing else', () => {
  it('the hold is `practising`, the same eleven beats the band and the way out use', () => {
    expect(code).toMatch(/hold=\{practising\(run\)\}/);
    expect(code).toMatch(/also=\{ALSO\[run\.step\]\}/);
    // And it is the eleven, not a twelfth list written out here.
    expect(IN_PRACTICE).toEqual(COACHED);
  });

  it('so the setup screens, the look, the slabs and the finish card are untouched', () => {
    // She has to get through those, they draw no ring, and there is nothing on
    // them to wander into. `practising` is false for every one of them.
    for (const step of ['welcome', 'folder', 'name', 'look', 'inbox', 'away', 'goal', 'hand', 'done', 'landed']) {
      expect(practising({ step, practice: 'practice' }), `${step} is held`).toBe(false);
    }
    for (const step of IN_PRACTICE) {
      expect(practising({ step, practice: 'practice' }), `${step} is not held`).toBe(true);
    }
  });

  it('and a walk with no practice project holds nothing, because there is no band', () => {
    for (const step of IN_PRACTICE) {
      expect(practising({ step, practice: null })).toBe(false);
    }
  });

  it('the listener is only ever installed while the hold is on', () => {
    expect(code).toMatch(/if \(!hold\) return undefined;/);
  });
});

describe('4. ALSO names only what a card says out loud', () => {
  it('is one beat and no more', () => {
    // It is not a spare copy of ANCHOR and it must never become one: every
    // entry is a second route the beat's own card offers and the ring cannot be
    // round at the same time.
    //
    // THE ANSWER BEAT CAME OUT ON 2026-09-01. It belonged here while its ring
    // was round a close-this-task button, because then the reply box really was
    // a second thing the same card named. That button has not existed since
    // 2026-08-27 and the ring is the reply box itself now, which makes an entry
    // naming the reply box exactly the spare copy this forbids.
    expect(Object.keys(ALSO).sort()).toEqual(['unblock']);
    expect(ALSO.unblock).toEqual(['.focus-dock']);
    expect(ALSO.answer).toBeUndefined();
    expect(ANCHOR.answer[0]).toContain('.focus-dock');
  });

  it('and the reply box it names is really what that card offers', () => {
    // 'It gave you three answers to pick from. Press 1 to send the one it
    // recommends.' The strip's own heading says the rest of it out loud.
    expect(focus).toMatch(/pick or write your own/);
    // Which lives in the docked reply surface, the one selector left here.
    expect(focus).toMatch(/className="focus-dock"/);
    // And the answer beat still names replying, which is now what it rings.
    // THE WORD IS LOWER CASE SINCE 2026-10-01, because the sentence no longer
    // opens on it: it reads "Click the box below to reply, or press E to close
    // it", which names the box for the people who do not use shortcuts. What is
    // being checked is unchanged, which is that the card names replying at all.
    const answer = coach('answer', 0, {});
    expect(`${answer.quiet} ${answer.lead}${answer.tail}`).toMatch(/reply/i);
  });

  it('every beat named has an anchor of its own, so ALSO only ever adds', () => {
    for (const step of Object.keys(ALSO)) {
      expect(IN_PRACTICE).toContain(step);
      expect(ANCHOR[step]).toBeTruthy();
    }
  });
});

describe('5. what the app answers a stray click with', () => {
  it('is the cap the wrong key already pulses, on the same counter', () => {
    // One answer, not two. `Card` folds the click count into the number a wrong
    // key bumps, so a click on the wrong thing and a press of the wrong key say
    // the same thing with the same object.
    expect(code).toMatch(/const pulse = wrong \+ knock;/);
    expect(code).toMatch(/key=\{pulse\}/);
    expect(code).toMatch(/\$\{pulse \? 'fr-wrong' : ''\}/);
  });

  it('and the veil deepening, so what she reached for goes quiet', () => {
    expect(code).toMatch(/<Veil key=\{knock\} box=\{geo\.ring\} knocked=\{knocked\} \/>/);
    expect(code).toMatch(/const knocked = knock \? ' fr-knock' : '';/);
    const veil = rule('.fr-veil.fr-knock');
    expect(veil).toMatch(/animation: fr-knock-veil/);
    const f = frames('fr-knock-veil');
    expect(f).toMatch(/var\(--fr-veil\)/);
    expect(f).toMatch(/var\(--fr-veil-knock\)/);
  });

  it('and the ring swelling once, so the thing to press does not go quiet', () => {
    expect(code).toMatch(/className=\{`halo\$\{knocked\}`\}/);
    expect(rule('.fr-ring .halo.fr-knock')).toMatch(/animation: fr-knock-ring/);
    const f = frames('fr-knock-ring');
    expect(f).toMatch(/stroke-width: 6/);
    expect(f).toMatch(/stroke-width: 11/);
  });

  it('all three end together, on the number the cap has had since 08-23', () => {
    // If these drift, two of the three finish while the third is still going
    // and the walk reads as twitching.
    expect(WRONG_MS).toBe(620);
    expect(rule('.fr-veil.fr-knock')).toContain(`${WRONG_MS}ms`);
    expect(rule('.fr-ring .halo.fr-knock')).toContain(`${WRONG_MS}ms`);
    expect(rule('.fr-tether kbd.fr-wrong')).toContain(`${WRONG_MS}ms`);
  });

  it('nothing moves, nothing changes colour, and no alarm colour appears', () => {
    // Her design law: alarm colour belongs where the eye is meant to be, and a
    // person exploring an app is not an error.
    const veil = frames('fr-knock-veil');
    const ring = frames('fr-knock-ring');
    for (const f of [veil, ring]) {
      expect(f).not.toMatch(/transform|translate|rotate|scale/);
      expect(f).not.toMatch(/red|crimson|#f[0-9a-f]{2}[0-9a-f]{0,3}\b/i);
    }
    // The ring only ever changes how thick it is: the colour is the one it
    // already wears and nothing here touches it.
    expect(ring).not.toMatch(/stroke:/);
    expect(ring).not.toMatch(/fill/);
    // AND THE DEEPER VEIL IS THE SAME COLOUR, TURNED UP. Measured off the
    // tokens rather than eyeballed: same rgb triple, more alpha, both themes.
    const tokens = [...cssCode.matchAll(/--fr-veil(-knock)?: rgba\(([^)]+)\);/g)]
      .map((m) => ({ knock: !!m[1], parts: m[2].split(',').map((n) => Number(n.trim())) }));
    expect(tokens).toHaveLength(4);
    for (let i = 0; i < tokens.length; i += 2) {
      const [rest, knock] = [tokens[i], tokens[i + 1]];
      expect(knock.knock).toBe(true);
      expect(knock.parts.slice(0, 3)).toEqual(rest.parts.slice(0, 3));
      expect(knock.parts[3]).toBeGreaterThan(rest.parts[3]);
    }
  });

  it('and it says nothing, on a card that is still two lines', () => {
    // The answer to a stray click adds no sentence anywhere, which is why it is
    // three classes on three elements that already existed rather than anything
    // new to read.
    expect(cssCode).not.toMatch(/\.fr-knock[^{]*::(before|after)/);
    expect(rule('.fr-veil.fr-knock')).not.toMatch(/content:/);
    expect(rule('.fr-ring .halo.fr-knock')).not.toMatch(/content:/);
    // No modal and no toast: the only thing the click handler does besides
    // stopping the event is bump the count.
    const at = code.indexOf('if (!hold) return undefined;');
    const listener = code.slice(at, code.indexOf('}, [hold,', at));
    expect(listener).not.toMatch(/showToast|setModal|alert|role="dialog"/);
    expect(listener).toMatch(/setKnock\(\(n\) => n \+ 1\)/);
  });

  it('a Mac told to stop animating things is obeyed', () => {
    // The stylesheet has several of these; this is the one that names the two
    // rules added here, found by what is in it rather than by where it sits.
    const block = cssCode
      .split('@media (prefers-reduced-motion: reduce)')
      .find((b) => b.includes('.fr-veil.fr-knock'));
    expect(block, 'no reduced-motion block names the knock').toBeTruthy();
    expect(block).toContain('.fr-ring .halo.fr-knock');
    expect(block.slice(0, block.indexOf('\n}'))).toContain('animation: none');
  });
});

describe('6. what is deliberately left alone', () => {
  it('scrolling, hovering, moving the pointer and resizing are not touched', () => {
    // A window that will not scroll does not read as a tutorial holding the
    // beat, it reads as an app that has crashed.
    for (const never of ['wheel', 'scroll', 'mousemove', 'mouseenter', 'mouseover', 'keydown', 'resize', 'touchmove']) {
      expect(HELD_EVENTS, `${never} is held`).not.toContain(never);
    }
  });

  it('but one press of the mouse is stopped on every event it arrives as', () => {
    // The app listens on more than one of these, so stopping only `click` would
    // leave a row selecting itself on mousedown under a walk that had just
    // refused the click.
    expect([...HELD_EVENTS]).toEqual(['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']);
  });

  it('and the browser is still a browser: only the click is default-prevented', () => {
    // `preventDefault` on mousedown would cancel text selection and focus,
    // which is the same distinction `swallowPress` draws for ⇥ — moving the
    // focus ring is not a command being processed. So selecting a word in an
    // agent's message still works while the row underneath stays shut.
    const at = code.indexOf('if (!hold) return undefined;');
    const listener = code.slice(at, code.indexOf('}, [hold,', at));
    expect(listener).toMatch(/e\.stopImmediatePropagation\(\);/);
    expect(listener.match(/e\.preventDefault\(\)/g)).toHaveLength(1);
    expect(listener).toMatch(/if \(e\.type === 'click'\) \{/);
    const beforePrevent = listener.slice(0, listener.indexOf('e.preventDefault()'));
    expect(beforePrevent).toMatch(/if \(e\.type === 'click'\) \{\s*$/);
  });

  it('and it runs on the way down, so the app never hears it', () => {
    const at = code.indexOf('for (const t of HELD_EVENTS) window.addEventListener');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 200)).toMatch(/addEventListener\(t, on, true\)/);
    expect(code).toMatch(/removeEventListener\(t, on, true\)/);
  });
});
