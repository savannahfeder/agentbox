// TWO DOORS, AND A PROJECT IS STILL A THING YOU CAN TICK.
//
// Round four drew her four looks. She threw all four out:
//
// So the card opens on two doors and the list is one screen behind the second.
// The round before it is still binding, and its two halves were MEASURED on the
// real built renderer with eight folders and fifteen agents on a throwaway Mac
//:
//
//   * the list DID scroll, 1,790px of it inside 602px, and the scrollbar was
//     ZERO pixels wide. Five of the eight projects were under a fold nothing on
//     the screen mentioned.
//   * bringing in exactly one project took between THIRTEEN and FIFTEEN presses,
//     because the only tick on the card was per agent.
//
// This pins all of it in the arithmetic, so the next redesign cannot quietly
// drop one of them while looking cleaner.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Name } from '../shared/product-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const card = fs.readFileSync(path.join(root, 'renderer/src/components/ImportAgents.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

const src = fs.readFileSync(path.join(root, 'renderer/src/agent-import-card.ts'), 'utf8');
const mod = await import('../renderer/src/agent-import-card.ts');
const {
  DOOR, allPicked, bringAllLine, goLine, pressLine,
  sectionState, toggleSection, totalLine,
} = mod;

/**
 * The shape the measurement found on her kind of Mac: a home folder set, one
 *  project of hers, and folders nobody points at yet. */
const agent = (n, folder) => ({ name: n, title: n, path: `${folder}/.claude/agents/${n}.md`, line: 'Does the thing.' });
const dests = [
  { key: 'everywhere', kind: 'everywhere', name: 'Apollo', slug: 'apollo', folder: null, where: '~/.claude/agents',
    items: [agent('a1', '~'), agent('a2', '~'), agent('a3', '~')] },
  { key: 'project:apollo', kind: 'project', name: 'Apollo', slug: 'apollo', folder: '/dev/apollo', where: '~/dev/apollo',
    items: [agent('b1', '/dev/apollo'), agent('b2', '/dev/apollo')] },
  { key: 'new:/dev/orbit', kind: 'new', name: 'Orbit', slug: null, folder: '/dev/orbit', where: '~/dev/orbit',
    items: [agent('c1', '/dev/orbit'), agent('c2', '/dev/orbit'), agent('c3', '/dev/orbit')] },
  { key: 'new:/dev/lantern', kind: 'new', name: 'Lantern', slug: null, folder: '/dev/lantern', where: '~/dev/lantern',
    items: [agent('d1', '/dev/lantern')] },
];
const every = allPicked(dests);

describe('why cant we just give two options', () => {
  it('opens on two doors and nothing else', () => {
    // Her first door names its own count, because a press that takes
    // twenty-eight agents has to say twenty-eight before it takes them. "Bring
    // in" became "Add" on 2026-08-28.
    expect(bringAllLine(dests)).toBe('Add all nine agents');
    expect(bringAllLine([dests[3]])).toBe('Add the one agent');
    expect(DOOR.pick).toBe('Choose which ones');
    // Exactly two of them on the first screen.
    const doors = card.slice(card.indexOf('const doors = ('), card.indexOf('const chooser'));
    expect((doors.match(/className="ia-door(?: is-first)?"/g) ?? []).length).toBe(2);
  });

  it('keeps the promise under the doors but not the half that names a tick', () => {
    // on a screen where nothing is ticked names something she has not
    // done. What a press that makes six projects needs is the other half.
    expect(DOOR.never).toBe(`${Name} never moves your agent files.`);
    const doors = card.slice(card.indexOf('const doors = ('), card.indexOf('const chooser'));
    expect(doors).toContain('{DOOR.never}');
    expect(doors).not.toContain('COPY.agentsRead');
  });

  it('says under the first door how many projects the press would make', () => {
    // is her own sentence, and five new projects in her sidebar is news. News
    // goes before the press, not in the toast after it.
    expect(pressLine(dests, every)).toBe(`${Name} files them under four projects. Two of them become new projects.`);
    const doors = card.slice(card.indexOf('const doors = ('), card.indexOf('const chooser'));
    expect(doors).toContain('pressLine(dests, allPicked(dests))');
  });

  it('presses the whole card without ticking it first', () => {
    // Nothing is ticked when the doors are up, so door one hands the list to
    // `bring` rather than setting state React has not handed back yet.
    expect(card).toContain('const bringAll = useCallback(() => bring(allPicked(dests))');
    expect(card).toContain('const bring = useCallback(async (paths: string[])');
  });

  it('is ONE screen behind the second door, never eight', () => {
    expect(card).toContain("useState<'door' | 'pick'>('door')");
    expect(card).not.toContain('setStep');
    expect(card).not.toMatch(/\{step \+ 1\} of/);
  });
});

describe('how do I select just one project', () => {
  it('does it in ONE press, where the card she read took thirteen to fifteen', () => {
    // The choose screen opens with NOTHING ticked, so ticking a project is the
    // whole gesture. `onlySection` and its per-row "Only this" bought the same
    // press on a screen that opened full, and both are deleted.
    const one = toggleSection(dests, [], 'new:/dev/orbit');
    expect(one).toHaveLength(3);
    expect(one.every((p) => p.includes('/dev/orbit'))).toBe(true);
    // And nothing from anywhere else came with it, which is the half that
    // matters: the rule is that an agent stays in its own folder.
    expect(one.some((p) => p.includes('apollo') || p.includes('lantern'))).toBe(false);
  });

  it('opens the choose screen empty, so the two doors are not the same door', () => {
    expect(card).toContain('useState<string[]>([])');
    expect(src).not.toContain('export function pickedAtOpen');
    expect(mod.onlySection).toBeUndefined();
    expect(mod.clearSection).toBeUndefined();
    expect(card).not.toContain('ia-only');
    expect(css).not.toContain('.ia-only {');
  });

  it('leaves the other three projects holding nothing at all', () => {
    const one = toggleSection(dests, [], 'new:/dev/orbit');
    for (const d of dests) {
      expect(sectionState(d, one), d.name).toBe(d.key === 'new:/dev/orbit' ? 'all' : 'none');
    }
  });

  it('gives a whole project one tick, with a half state it can actually be in', () => {
    expect(sectionState(dests[0], every)).toBe('all');
    expect(sectionState(dests[0], [])).toBe('none');
    expect(sectionState(dests[0], [dests[0].items[0].path])).toBe('some');
  });

  it('clears a half-ticked project rather than filling it back up', () => {
    // A toggle that resolved the half state UPWARD would undo a person who had
    // just spent four presses taking agents out of a project.
    const half = [dests[0].items[0].path];
    expect(toggleSection(dests, half, 'everywhere')).toEqual([]);
    expect(toggleSection(dests, [], 'everywhere')).toHaveLength(3);
  });

  it('puts the whole-project tick on the row itself', () => {
    expect(card).toContain('toggleSection(dests, picked, d.key)');
    expect(card).toContain('aria-label={`Keep everything in ${nameOf(d)}`}');
  });
});

describe('if there are lots of projects', () => {
  it('says how many there are in a header that never scrolls', () => {
    expect(totalLine(dests)).toBe('Nine agents in four folders.');
    // The header is outside every `ia-scroll` on the card, which is the whole
    // point of it: with eight folders, five were below the fold.
    const top = card.slice(card.indexOf('<div className="ia-top">'), card.indexOf('{!found &&'));
    expect(top).toContain('{total}');
    expect(top).not.toContain('ia-scroll');
  });

  it('counts what is under the fold and says it in words', () => {
    expect(card).toContain('more below');
    expect(card).toContain('getBoundingClientRect');
    // Measured off the screen and not off `offsetTop`, which in a modal is
    // relative to an ancestor that is not the list and got three of four wrong.
    expect(card).not.toContain('offsetTop + 10');
  });

  it('does NOT answer it by turning the permanent scrollbar back on', () => {
    // The app hides them at rest and this card does not get to make an
    // exception for itself.
    const block = css.slice(css.indexOf('.ia-scroll {'), css.indexOf('.ia-box {'));
    expect(block).not.toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*var\(--line-strong\)/);
    expect(block).toContain('.ia-more');
  });

  it('scrolls the one list there is, and says so under it', () => {
    expect(css).toMatch(/\.ia-stack[^{]*\{[^}]*max-height/);
    expect(card).toContain('ia-scroll ia-stack');
    expect(card).toContain('{moreBelow}');
  });

  it('has a way back off the choose screen', () => {
    // A second screen with no way off it is the eight pages she rejected.
    expect(card).toContain('<button className="ia-back"');
    expect(card).toContain("if (screen === 'pick') { setScreen('door'); return; }");
  });
});

describe('the press says what it is about to do, before it happens', () => {
  it('names the number of agents in the button and nothing else', () => {
    expect(goLine(dests, [])).toBe('Nothing ticked');
    expect(goLine(dests, [every[0]])).toBe('Add one agent');
    expect(goLine(dests, every)).toBe('Add nine agents');
  });

  it('puts the inboxes and the new projects in a sentence, not in a button', () => {
    expect(pressLine(dests, toggleSection(dests, [], 'new:/dev/lantern')))
      .toBe('Lantern becomes a new project.');
    expect(pressLine(dests, every))
      .toBe(`${Name} files them under four projects. Two of them become new projects.`);
    expect(pressLine(dests, [])).toBe('');
  });

  it('never leaves a count word capitalised in the middle of a line', () => {
    for (const s of [goLine(dests, every), pressLine(dests, every), totalLine(dests), bringAllLine(dests)]) {
      const mid = s.slice(s.indexOf(' ') + 1);
      expect(mid, s).not.toMatch(/\b(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten) (agent|folder|inbox)/);
    }
  });
});

describe('the four looks are gone and stay gone', () => {
  it('keeps no look switch and no second shape of the list', () => {
    expect(mod.LOOKS).toBeUndefined();
    expect(mod.isLook).toBeUndefined();
    expect(card).not.toContain('zero.importLook');
    for (const name of ['columns', 'oneAtATime', 'lines']) {
      expect(card, `${name} is still here`).not.toContain(`const ${name} `);
    }
  });

  it('takes their rules out of the stylesheet too', () => {
    for (const cls of ['.ia-cols', '.ia-col-row', '.ia-one-name', '.ia-skip', '.ia-line-row', '.ia-dot']) {
      expect(css, `${cls} is still styled`).not.toContain(`${cls} {`);
    }
    expect(css).not.toContain('.modal.ia-card.look-columns');
  });

  it('says once, in words, where their copy went', () => {
    expect(card).toContain('decisions.md');
    expect(src).toContain('decisions.md');
  });
});

describe('the ticks wait for the whole Mac to be read', () => {
  // MEASURED, not reasoned about (2026-08-26, twenty folders on a throwaway
  // Mac, the real built renderer): the folder scan is slower than the agent file
  // read, so the card offered to bring in five agents out of twenty-eight with
  // eighteen sections listed and empty. At eight folders the scan won the race
  // and nothing showed.
  //
  // It matters more now, not less: door one takes everything the card is holding
  // in one press, so a card drawn before the scan lands would take a fifth of her
  // Mac and say it took all of it.
  it('holds the whole card until the folder scan comes back, not just the file read', () => {
    // Null until the scan lands, whether the scan is this card's own or the
    // walk's handed in. Inside the walk it has already run a beat early; out
    // in ⌘K it starts here. Either way the card waits on it.
    expect(card).toContain('useState<AgentFolder[] | null>(walk ? walk.folders : null)');
    // AND THE THREAD WALK IS THE THIRD READ, and the slowest of the three:
    // measured at 1.7 seconds over her 2,445 transcripts, against milliseconds
    // for the two folder reads. So the gate is one word covering all three
    // rather than a pair spelled out seven times.
    expect(card).toContain('useState<SessionThread[] | null>(null)');
    expect(card).toContain('const read = !!found && !!others && threads !== null;');
    expect(card).toContain('{read && some && body}');
  });

  it('says "Reading this Mac" for the whole of that wait, rather than half a list', () => {
    expect(card).toContain('{!read && <div className="ia-empty">');
    // Every branch that draws the card is gated on that same one word, so no
    // state of it can offer a section a read has not filled in yet.
    for (const branch of ['{read && some && body}', '{read && some && (', '{read && !some && (']) {
      expect(card).toContain(branch);
    }
    // And nothing draws itself off a subset of the three.
    expect(card).not.toContain('found && others &&');
  });
});

/*
 * ROUND SIX, the two doors.
 *
 * The shape is APPROVED and closed. What follows is the two corrections inside
 * it, pinned so the next redesign cannot quietly undo either. */
describe('a project row says out loud that it opens', () => {
  // IT ALREADY OPENED. Nobody could tell, and that is the whole finding:
  // MEASURED on the real built renderer with eight folders, a closed project row carried ZERO
  // carets, ZERO chevrons and ZERO svgs. The one thing on it that said so was
  // `aria-expanded="false"`, which a screen reader is told and a person looking
  // at the screen is not.
  it('draws a mark on the row, not just an aria-expanded nobody can see', () => {
    expect(card).toContain('function Caret()');
    expect(card).toContain('className="ia-caret"');
    // On the row itself, inside the line that carries the name and the count.
    expect(card).toMatch(/ia-blk-n[^]*?<Caret \/>/);
  });

  it('draws it rather than typing it, for the reason the tick is drawn', () => {
    // A caret written as a character is a different size and weight in every
    // font a Mac reaches for, and this one sits beside a count on a baseline.
    expect(card).toMatch(/function Caret\(\)[^]*?<svg/);
    for (const ch of ['▶', '▼', '›', '⌄', '+']) {
      expect(card, `${ch} is typed rather than drawn`).not.toContain(`>${ch}<`);
    }
  });

  it('says which way it is, rather than only that it moves', () => {
    expect(css).toContain('.ia-caret {');
    expect(css).toContain('.ia-blk.open .ia-caret');
    expect(css).toMatch(/\.ia-blk\.open \.ia-caret \{[^}]*rotate\(90deg\)/);
  });

  it('keeps the press that opens it on the row, so the mark is not a third control', () => {
    // The whole name area opens the block. The caret is a sign, not a button.
    expect(card).toContain('onClick={() => flip(d.key)} aria-expanded={opened(d.key)}');
    expect(card).not.toContain('onClick={() => flip(d.key)} className="ia-caret"');
  });

  it('still lets several be open at once', () => {
    // Closing one to read another is a press she did not ask for.
    expect(card).toContain("o.includes(k) ? o.filter((x) => x !== k) : [...o, k]");
  });
});

describe('All and None are gone', () => {
  // Both halves measured on the real card rather than argued: ALL ticked all
  // sixteen and the button read "Bring in 16 agents". Door one, one screen
  // earlier, reads "Bring in all 16 agents". The same press twice. NONE was the
  // state the screen opens in: `picked` starts empty.
  it('takes both controls off the header', () => {
    expect(card).not.toContain('className="ia-bulk"');
    expect(card).not.toContain('>All</button>');
    expect(card).not.toContain('>None</button>');
  });

  it('takes their rules out of the stylesheet too', () => {
    expect(css).not.toContain('.ia-bulk {');
    expect(css).not.toContain('.ia-bulk:hover');
  });

  it('leaves the one thing in that header the list cannot say', () => {
    // The total is what answers the zero-pixel scrollbar, so it stays.
    expect(card).toContain('<span className="ia-total">{total}</span>');
    expect(totalLine(dests)).toBe('Nine agents in four folders.');
  });

  it('keeps the choose screen opening empty, which is what made None redundant', () => {
    expect(card).toContain('useState<string[]>([])');
    expect(mod.pickedAtOpen).toBeUndefined();
  });

  it('says where their copy went', () => {
    expect(card).toContain('decisions.md');
    expect(css).toContain('decisions.md');
  });
});

describe('the tick sits on the middle of the name beside it', () => {
  // MEASURED on the real card before anything was changed
  // (the harness, eight folders): a project's tick
  // stood 1.69px ABOVE the middle of its name's capitals on all eight rows, and
  // an agent's tick sat 1.10px BELOW its own, so the two disagreed by 2.79px.
  // After: 0.18px and 0.38px, which is under one device pixel at her scale.
  //
  // What can be tested here is the RULE, not the pixels: layout is what the
  // script measures and jsdom has none.
  it('centres the box on the label line instead of pinning it to the top', () => {
    expect(css).toMatch(/\.ia-box \{[^}]*margin-top: calc\(\(var\(--tick-line/);
  });

  it('gives each kind of row its own label line, because the two sizes differ', () => {
    // 15px at 1.25 for a project name, 13px at 1.35 for an agent's.
    expect(css).toMatch(/\.ia-blk-head \{ --tick-line: 18\.75px; \}/);
    expect(css).toMatch(/\.ia-agent \{ --tick-line: 17\.55px; \}/);
  });

  it('drops the old nudge that only moved the agent rows', () => {
    expect(css).not.toContain('.ia-agent .ia-box { margin-top: 2px; }');
  });

  it('keeps every tick on the screen in one column when nothing is open', () => {
    // The indent only exists under an open project, and it is the hierarchy she
    // asked for: an agent's tick lines up with its project's NAME.
    expect(css).toMatch(/\.ia-blk-list \{[^}]*padding-left: 24px/);
    expect(css).toMatch(/\.ia-blk-head \{[^}]*gap: 10px/);
    expect(css).toMatch(/\.ia-box \{[^}]*width: 14px/);
  });
});

/*
 * ROUND EIGHT (2026-08-27). THE WALK ENDS ON THIS CARD, AND THERE IS ONLY ONE.
 *
 * She was right and the app was up to date. There were TWO agent import cards.
 * Seven rounds of this row rebuilt the one ⌘K opens; the walk kept an older
 * copy of its own — one flat list under an `Every project` / `Only this
 * project` switch, everything ticked, no way to reach a folder that was not
 * already a project — and every round on this row walked past it, because a
 * note at the top of agent-import-card.ts argued the walk's shape was right
 * inside a setup.
 *
 * That is the failure this block exists to make impossible to repeat: not a
 * wrong card, a SECOND card. So it does not check what the walk's screen looks
 * like. It checks there is one component that draws this offer and that the
 * walk uses it.
 *
 * DRIVEN FOR REAL, not only read: the harness
 * takes the real walk to its real last screen on a throwaway Mac with agents in
 * four folders. Measured 2026-08-27: seven agents in four folders, `.fr-switch`
 * count 0, `.fr-agent` count 0, `.fr-finish-go` absent, and one press of door
 * one made two projects and filed all seven rows into four inboxes. */
describe('the walk ends on this card and there is not a second one', () => {
  const walk = fs.readFileSync(path.join(root, 'renderer/src/components/Onboarding.tsx'), 'utf8');
  const logic = fs.readFileSync(path.join(root, 'renderer/src/onboarding.ts'), 'utf8');

  it('draws this component on the last step rather than a copy of it', () => {
    expect(walk).toContain("import { ImportAgents } from './ImportAgents';");
    expect(walk).toMatch(/<ImportAgents\b/);
    expect(walk).toMatch(/walk=\{\{/);
  });

  it('has no switch, no side and no agent row of its own left anywhere', () => {
    // The four class names the old card was built out of. Any one of them back
    // in this file is a second card growing again.
    for (const gone of ['className="fr-switch"', 'className="fr-offer"', "'fr-side'", "'fr-agent'"]) {
      expect(walk).not.toContain(gone);
    }
    // And the logic behind it, which is what made the old card cheap to keep.
    for (const gone of ['export function agentGroups', 'export function scopeAtOpen',
      'export function chosenAtOpen', 'export function toggleAgent']) {
      expect(logic).not.toContain(gone);
    }
  });

  it('is the only component in the app that draws an agent import', () => {
    // ModeScreen.tsx is excluded ON PURPOSE and it is not a second card: it is
    // a proposal awaiting, reachable only from `?modes=`, drawing the walk's
    // old markup as a mock of a screen that has not been decided. Whoever
    // answers that row redraws it against this card.
    const dir = path.join(root, 'renderer/src/components');
    const drawers = fs.readdirSync(dir).filter((f) => {
      if (f === 'ImportAgents.tsx' || f === 'ModeScreen.tsx') return false;
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      return /className="(ia-door|ia-blk|fr-switch|fr-agent)"/.test(text);
    });
    expect(drawers).toEqual([]);
  });

  it('names the project off the walk when the app has not caught up', () => {
    // MEASURED with this returning a filtered empty list: the card said "Make a
    // project and they have an inbox" over a project she had made four screens
    // earlier, and door one filed her folder agents while dropping her home
    // folder set, whose inbox is that project.
    const fn = walk.slice(walk.indexOf('function walkProject('), walk.indexOf('/** THE FOLDER GLYPH'));
    expect(fn).toMatch(/products\.filter\(\(p\) => p\.slug === run\.product\)/);
    expect(fn).toMatch(/return \[\{ slug: run\.product, name: run\.name, repoPath: run\.folder \}\]/);
  });

  it('cannot be escaped out of, and offers a way on that brings nothing in', () => {
    // The walk is the way out, so Escape steps back off the choose screen and
    // then stops. What replaces it is the old card's button, with its own label.
    expect(card).toContain('if (walk) return;');
    expect(card).toContain('skip: string;');
    expect(walk).toContain('skip: COPY.finishGo,');
    expect(walk).toContain('onSkip: () => onDone([]),');
  });
});
