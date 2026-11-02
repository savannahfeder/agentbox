// A CONNECTION CARD SHOWS ITS REAL LOGO, AND A STATE ONLY WHEN IT SAYS SOMETHING.
//
// What was wrong (2026-11-02, the light-mode pictures of the page): every tool
// was a one-colour mark in a grey square on a grey card, so the page read as a
// form of disabled fields, and every card carried "Not connected", "Needs an
// app made in it" or "Takes a personal token". The owner: "the connections
// page is almost non usable, should have real logos not b&w versions".
// Measured here: a colour logo file for every tool, small and stripped, the
// dark marks lightened in Dark, no square behind a logo, and the words a
// card shows in each state.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { catalogFor } from '../shared/connections-catalog.mjs';
import { cardState } from '../renderer/src/connections/connections-shown';
import { DARK_INK, logoOf } from '../renderer/src/connections/logos';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LOGOS = 'renderer/src/connections/logos';
const NOW = 1_800_000_000_000;
const ids = catalogFor().map((t) => t.id);
const colours = (svg) => [...svg.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => m[1].toLowerCase());
const grey = (hex) => {
  const h = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
};

describe('the logos', () => {
  it('every tool in the catalogue has its own logo file', () => {
    for (const id of ids) {
      expect(fs.existsSync(path.join(root, LOGOS, `${id}.svg`)), id).toBe(true);
      expect(logoOf(id), id).toBeTruthy();
    }
  });

  it('is in colour, apart from the marks that are black', () => {
    expect([...DARK_INK].sort()).toEqual(['github', 'intercom', 'sentry', 'vercel']);
    // Notion's own mark is black on white, which reads on either ground.
    for (const id of ids.filter((i) => !DARK_INK.has(i) && i !== 'notion')) {
      expect(colours(read(`${LOGOS}/${id}.svg`)).some((c) => !grey(c)), id).toBe(true);
    }
  });

  it('is small and carries no editor metadata', () => {
    for (const f of fs.readdirSync(path.join(root, LOGOS))) {
      const svg = read(`${LOGOS}/${f}`);
      expect(svg.length, f).toBeLessThan(8000);
      expect(svg, f).not.toMatch(/<\?xml|<!--|<metadata|<title|sketch|inkscape/i);
      expect(svg, f).toMatch(/^<svg [^>]*viewBox=/);
    }
  });

  it('says where it came from in one comment', () => {
    expect(read('renderer/src/connections/logos.ts')).toMatch(/gilbarbara\/logos/);
  });

  it('a tool added by its address has no logo and keeps the neutral letter', () => {
    expect(logoOf('mcp-example-com')).toBeNull();
    expect(read('renderer/src/connections/ConnectionsPlace.tsx')).toMatch(/cn-mark-letter/);
  });

  it('is drawn as itself, with no grey square behind it', () => {
    const css = read('renderer/src/connections/connections.css');
    const mark = css.match(/\.cn-mark \{[^}]*\}/)?.[0] ?? '';
    expect(mark).not.toMatch(/background/);
  });

  it('lightens the black and near-black marks in Dark, and nowhere else', () => {
    const css = read('renderer/src/connections/connections.css');
    expect(css).toMatch(/:root\[data-theme="dark"\] \.cn-mark-ink img/);
    expect(read('renderer/src/connections/ConnectionsPlace.tsx')).toMatch(/DARK_INK\.has\(id\)/);
  });
});

const tile = (over) => ({ state: 'not_connected', word: 'Not connected', connected: false, access: 'sign_in', name: 'Linear', at: null, failures: [], changed: [], ...over });

describe('the words on a card', () => {
  it('a tool nobody has connected says nothing, whatever it takes to connect', () => {
    for (const access of ['sign_in', 'own_client', 'key']) expect(cardState(tile({ access }), NOW), access).toEqual({ tone: null, words: null, todo: null });
  });

  it('a tool that cannot be connected yet says so in three words or fewer', () => {
    const s = cardState(tile({ access: 'vendor_approval', name: 'Figma' }), NOW);
    expect(s.words).toBe('Not available yet');
    expect(s.tone).toBeNull();
  });

  it('a working one is Connected, with the green dot', () => {
    expect(cardState(tile({ connected: true, state: 'works', word: 'Works', at: NOW - 60_000 }), NOW)).toEqual({ tone: 'good', words: 'Connected', todo: null });
  });

  it('a failing one is Not working, with what to do in a word or two', () => {
    const cases = [
      [{ state: 'not_signed_in' }, 'Sign in'],
      [{ state: 'not_allowed' }, 'Needs access'],
      [{ state: 'down', nextTryAt: NOW + 60_000 }, 'Trying again'],
      [{ state: 'down', nextTryAt: null, stoppedTryingAt: NOW - 1 }, 'Check it'],
      [{ state: 'unreachable' }, 'Reconnect'],
      [{ state: 'works', at: NOW - 600_000, failures: [{ at: NOW - 1000, tool: 'get_issue', why: 'x' }] }, 'Check it'],
    ];
    for (const [over, todo] of cases) {
      const s = cardState(tile({ connected: true, word: 'x', ...over }), NOW);
      expect(s, over.state).toEqual({ tone: 'hurt', words: 'Not working', todo });
      expect(todo.split(' ').length).toBeLessThanOrEqual(2);
    }
  });

  it('a working one that read a while ago and failed before that is still Connected', () => {
    const s = cardState(tile({ connected: true, state: 'works', at: NOW - 1000, failures: [{ at: NOW - 600_000, tool: 'get_issue', why: 'x' }] }), NOW);
    expect(s.words).toBe('Connected');
  });

  it('a connected one waiting on you says what in a few words', () => {
    expect(cardState(tile({ connected: true, state: 'choose_reads' }), NOW).words).toBe('Choose its tools');
    expect(cardState(tile({ connected: true, state: 'nothing_to_read' }), NOW).words).toBe('Nothing to read');
  });

  it('the old offer words are gone from the page', () => {
    const src = read('renderer/src/connections/ConnectionsPlace.tsx') + read('renderer/src/connections/connections-shown.ts');
    for (const gone of ['Needs an app made in it', 'Takes a personal token', '\'s approval', 'offerLine']) expect(src).not.toContain(gone);
  });
});

describe('the card itself', () => {
  const css = read('renderer/src/connections/connections.css');
  it('is a card on the page, not a filled field: the page colour in Light, raised in Dark', () => {
    const card = css.match(/\.cn-tile \{[^}]*\}/)?.[0] ?? '';
    expect(card).toMatch(/background: var\(--surface\)/);
    expect(card).toMatch(/border-radius: var\(--artifact-corner\)/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \.cn-tile[^{]*\{[^}]*var\(--bg-raised\)/);
  });

  it('offers Connect quietly, on hover, only where Connect is the next step', () => {
    const src = read('renderer/src/connections/ConnectionsPlace.tsx');
    expect(src).toMatch(/cn-tile-go/);
    expect(css).toMatch(/\.cn-tile:hover \.cn-tile-go/);
  });
});
