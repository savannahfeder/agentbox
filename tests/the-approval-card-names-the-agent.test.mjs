// THE APPROVAL CARD SAYS WHICH AGENT IS ASKING, AND IS NOT A SLAB (w-34b7b861b6).
//
// Two of her three complaints on 2026-09-24 were about this one card:
//
//   "When a command comes up, I can't see the agent it's associated with.
//    There needs to be a clear way for me to see and even go into the agent."
//
//   "Our approvals component doesn't look that great because it doesn't really
//    match our design style. These themes should never have completely opaque
//    components like these, so it just looks visually poor."
//
// Both are the kind of fault that has no symptom in a passing suite: the card
// rendered perfectly well while naming the wrong thing and while sitting
// opaque on a photograph. So the contract is pinned here in the two files that
// carry it.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

it('draws the asking row title, and only when the row is there', () => {
  const app = read('App.tsx');
  // The id was on the request all along (main/approval-prompt-server.mjs
  // stamps it off ZERO_ITEM); the card simply never read it.
  expect(app).toContain('const row = approvalRow(a.item);');
  expect(app).toContain('className="approval-task"');
  expect(app).toContain('<span className="approval-task-title">{row.title}</span>');
  // A title she cannot click through to is a caption pretending to be a door,
  // so a missing row draws no button at all.
  expect(app).toContain('{row && (');
});

// HER HIERARCHY, 2026-09-24: "The most important thing to see is starting the
// store server so the worker can read the ledger. The chat and where it's
// located are actually lower in the hierarchy... I'd recommend cutting out
// anything that's not necessary. For instance, Agentbox asks to run."
it('leads with what the command does and puts the chat and the folder under it', () => {
  const app = read('App.tsx');
  const card = app.slice(app.indexOf('className="approvals"'), app.indexOf('approval-actions'));

  // The worker's own sentence is the lede. The product line is its FALLBACK
  // and nothing else, so it can never sit above a description again.
  expect(card).toContain('{said ?? <>{product} {reads.what}</>}');

  // The order on the card, top to bottom.
  const at = (s) => { const i = card.indexOf(s); expect(i, `${s} is not on the card`).toBeGreaterThan(-1); return i; };
  expect(at('approval-lede')).toBeLessThan(at('approval-cmd'));
  expect(at('approval-cmd')).toBeLessThan(at('approval-meta'));
  // What the yes opens stays with the command, above the quiet line: those two
  // sentences widen what runs and must never sit under the chat.
  expect(at('approval-opens')).toBeLessThan(at('approval-meta'));
  // The chat and the folder share one line rather than being two stacks.
  expect(at('approval-where')).toBeGreaterThan(at('approval-meta'));
  expect(at('approval-task')).toBeGreaterThan(at('approval-meta'));
});

it('never says the verb twice on one card', () => {
  const app = read('App.tsx');
  // With a description the verb goes quiet on the meta line; without one it is
  // already the lede, and repeating it underneath is the clutter she asked us
  // to cut.
  expect(app).toContain("const where = [said ? reads.what : null, cwd ? `in ${cwd}` : null]");
});

it('has dropped the blocks that were merged away', () => {
  const app = read('App.tsx');
  // Comments out, because this file's own notes name the old classes to say
  // why they went, and a test that reads prose would fail on the explanation.
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const gone of ['approval-head', 'approval-who', 'approval-what', 'approval-desc', 'approval-cwd']) {
    expect(app, `${gone} is back in the markup`).not.toContain(`"${gone}`);
    expect(css, `${gone} still has a rule`).not.toContain(`.${gone}`);
  }
});

it('opens that row without answering or dismissing the approval', () => {
  const app = read('App.tsx');
  const fn = app.match(/const openApprovalRow = useCallback\(\(id: string \| null\) => \{([\s\S]*?)\}, \[/);
  expect(fn, 'openApprovalRow is gone or has been reshaped').toBeTruthy();
  const body = fn[1];
  expect(body).toContain('setFocused(row)');
  // The press must not touch the approval. If either of these ever appears in
  // here, a click meant to go and read the agent has silently allowed or
  // denied a command on her Mac.
  expect(body).not.toContain('approve');
  expect(body).not.toContain('setAnswered');
});

// GLASS YOU CAN READ THROUGH IS NOT THE SAME AS GLASS. She came back on
// 2026-09-25: "can you make the background a little more blurred? i can see the
// content in its bckground of the card which makes it a little harder to read."
//
// This card is the one pane that floats over the live window rather than over a
// photograph, so --skin-pane over --skin-blur (0.22 of wash over 2px) left her
// inbox rows legible underneath these words. It wears the first-run card's
// glass now, which is the app's existing answer to exactly this and which she
// approved when that card shipped.
it('wears glass she can read through on a skin, not a flat fill', () => {
  const css = read('styles.css');
  const rule = css.match(/:root\[data-skin\] \.approval-card,\s*\n:root\[data-skin\] \.approval-ghost \{([^}]+)\}/);
  expect(rule, 'the approval card has lost its skin rule').toBeTruthy();
  // PAINTED AS WELL AS BLURRED. A pure blur over live content goes near-black
  // on a dark stretch and near-white on a light one, so the card would be
  // legible against one row and not the next.
  expect(rule[1]).toContain('color-mix(in oklab, var(--bg-raised) 62%, transparent)');
  expect(rule[1]).toContain('backdrop-filter: blur(22px) saturate(1.25)');
  expect(rule[1]).toContain('border-color: var(--skin-pane-line)');
  // AND STILL GLASS. If this ever reaches 100% the card is the opaque slab she
  // rejected in the first place, which is the tempting wrong answer to any
  // future "still hard to read".
  expect(rule[1]).not.toMatch(/background:\s*var\(--bg-raised\)\s*;/);
  const mix = rule[1].match(/var\(--bg-raised\) (\d+)%/);
  expect(Number(mix[1])).toBeLessThan(100);
  // The block inside it is a film over the card, not the window's own ground,
  // or the card is glass with a solid rectangle in the middle of it.
  expect(css).toContain(':root[data-skin] .approval-cmd { background: var(--film-strong); }');
  // NOT --control-face, which is a white film in every theme and only looks
  // right on dark.
  expect(css).not.toContain('.approval-cmd { background: var(--control-face)');
});

it('leaves plain light and dark exactly as they were', () => {
  const css = read('styles.css');
  const base = css.match(/\n\.approval-card \{([^}]+)\}/)[1];
  // Unscoped, the card keeps the fill and the hairline it has always had:
  // --skin-blur is 0px on those two and a blur over a flat colour is only a
  // slower way of drawing that colour.
  expect(base).toContain('background: var(--bg-raised)');
  expect(base).toContain('border: 1px solid var(--line-strong)');
  expect(base).not.toContain('backdrop-filter');
});
