// HER FIVE CHANGES TO THE SIDEBAR NOTE., 2026-08-21, answering the first
// drawing of it with two screenshots attached:
//
// The toggle is held next door in `the-panel-is-a-short-list.test.mjs`, because
// that is the file that owns the agents section. Everything else is here.
//
// WHAT THE FIRST SCREENSHOT ACTUALLY CONTAINED, measured off the file rather
// than looked at: ground #2e3136, the "This
// week" heading #f0f1f3, the bold line and the bullets #b6bac2, the "Notes"
// label #979ca6, and the task checkbox #ffffff. The checkbox was the brightest
// pixel in the panel and the only unstyled control in it. That is "the box".
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule in the note, keyed by the selector's tail, with comments gone so a
// hex quoted in prose can never be mistaken for a hex the app draws.
const noteRules = (() => {
  const out = [];
  const re = /\.rail-note-body[^{]*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(bare))) out.push({ sel: m[0].slice(0, m[0].indexOf('{')).trim(), body: m[1] });
  return out;
})();
const ruleFor = (needle) => noteRules.filter((r) => r.sel.includes(needle));
const declOf = (rules, prop) => {
  for (const r of rules) {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(r.body);
    if (m) return m[1].trim();
  }
  return null;
};

describe('the box she named has a darker fill', () => {
  const box = ruleFor('input[type="checkbox"]').filter((r) => !r.sel.includes(':'));

  it('is drawn by us at all, which it was not', () => {
    expect(box.length).toBe(1);
    expect(box[0].body).toMatch(/appearance:\s*none/);
  });

  it('is filled and outlined from the theme, so it is dark in dark mode', () => {
    expect(declOf(box, 'background')).toBe('var(--wash)');
    expect(declOf(box, 'border')).toBe('1px solid var(--line-strong)');
    // No literal colour anywhere in it, or one theme gets a box from another.
    expect(box[0].body).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(box[0].body).not.toMatch(/\bwhite\b|\brgb\(/);
  });

  it('never carries an accent, because the rail has no saturated pixel', () => {
    for (const r of ruleFor('taskList')) expect(r.body).not.toMatch(/--accent|accent-color/);
  });

  it('draws its tick in the note’s own bold ink and does not animate', () => {
    const tick = ruleFor('input[type="checkbox"]:checked::after');
    expect(tick.length).toBe(1);
    expect(tick[0].body).toMatch(/border:\s*solid var\(--text-dim\)/);
    expect(tick[0].body).not.toMatch(/transition|animation/);
  });

  it('quiets a finished line instead of striking it through', () => {
    const done = ruleFor('li[data-checked="true"]');
    expect(done.length).toBeGreaterThan(0);
    expect(declOf(done, 'color')).toBe('var(--agent-ink)');
    for (const r of done) expect(r.body).not.toMatch(/line-through/);
  });
});

describe('one header/bold state, and no bigger text or smaller text', () => {
  const heads = noteRules.filter((r) => /\bh[1-4]\b/.test(r.sel) && !r.sel.includes('strong'));

  it('draws every heading level with one rule', () => {
    expect(heads.length).toBe(1);
    for (const level of ['h1', 'h2', 'h3', 'h4']) expect(heads[0].sel).toContain(level);
  });

  it('sets that one state at the body’s own size, so nothing is bigger', () => {
    const body = ruleFor('> .ProseMirror');
    expect(declOf(body, 'font-size')).toBe('13.5px');
    expect(declOf(heads, 'font-size')).toBe('13.5px');
    expect(declOf(heads, 'font-weight')).toBe('600');
    expect(declOf(heads, 'color')).toBe('var(--text-dim)');
  });

  it('gives bold the same size, weight and ink, so the two are one look', () => {
    const strong = noteRules.filter((r) => r.sel.includes('strong') && !/\bh[1-4]\b/.test(r.sel) && !r.sel.includes('data-checked'));
    expect(strong.length).toBe(1);
    expect(declOf(strong, 'font-weight')).toBe('600');
    expect(declOf(strong, 'color')).toBe('var(--text-dim)');
    // No font-size on bold at all: it takes the body's, which is the heading's.
    expect(strong[0].body).not.toMatch(/font-size/);
  });

  it('has no size anywhere in the note other than the body’s and the code font’s', () => {
    const sizes = new Set();
    for (const r of noteRules) {
      const m = /font-size:\s*([\d.]+)px/.exec(r.body);
      if (m) sizes.add(m[1]);
    }
    expect([...sizes].sort()).toEqual(['12.5', '13.5']);
  });

  it('never lets a heading go bolder for being bold as well', () => {
    const both = noteRules.filter((r) => /\bh[1-4] strong/.test(r.sel));
    expect(both.length).toBe(1);
    expect(declOf(both, 'font-weight')).toBe('600');
  });
});

// ROUND THREE, AND IT REVERSES ROUND TWO'S DIRECTION BY HER HAND., 2026-08-21,
// on the panel round two built:
//
// Round two read an earlier sentence of hers as BRIGHTER and built a token,
// --note-ink, 0.4 of the way from --text-dim toward --text. This is her saying
// it pointed the wrong way. So the token is gone, not retuned, and the note now
// borrows the three greys the panel around it already draws — the three she
// named:
//
//   emphasis                        --text-dim    the product's name
//   the regular text, the bullets   --text-faint  the line under that name
//   a finished task                 --agent-ink   the agent rows
//
// Deleting the token takes a trap with it. Every skin had to declare its own
// note ink or the note drew darker than the text above it, and fifteen of
// sixteen skins were wrong at once the day they landed. There is nothing left
// for a new skin to forget, and the negative test below is what holds that.
describe('the note is low-key, in the panel\u2019s own greys', () => {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // Every block that declares an ink ladder of its own: the two base themes and
  // all sixteen skins.
  const ladders = [...bare.matchAll(/(:root[^{]*)\{([^}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2] }))
    .filter((b) => /--text-dim:/.test(b.body) && /--agent-ink:/.test(b.body));
  const pick = (body, name) => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(body);
    return m ? m[1] : null;
  };

  it('writes the regular text in the ink of the line under the product name', () => {
    expect(declOf(ruleFor('> .ProseMirror'), 'color')).toBe('var(--text-faint)');
  });

  it('has no colour of its own left anywhere, and no --note-ink token', () => {
    expect(bare).not.toMatch(/--note-ink/);
    // And nothing in the note names a colour directly, or one look gets another
    // look's note.
    for (const r of noteRules) expect(r.body, r.sel).not.toMatch(/#[0-9a-f]{3,8}\b|\brgb\(/i);
  });

  it('borrows only greys the panel around it already draws', () => {
    const used = new Set();
    for (const r of noteRules) {
      for (const m of r.body.matchAll(/color:\s*var\((--[a-z-]+)\)/g)) used.add(m[1]);
    }
    for (const token of used) {
      expect(['--text-dim', '--text-faint', '--agent-ink'], token).toContain(token);
    }
  });

  it('steps emphasis over text over a finished line, in every look', () => {
    expect(ladders.length).toBeGreaterThan(3);
    for (const b of ladders) {
      const [dim, faint, agent] = ['text-dim', 'text-faint', 'agent-ink'].map((n) => pick(b.body, n));
      expect([dim, faint, agent].every(Boolean), b.sel).toBe(true);
      // Emphasis is furthest from the ground, a finished line is nearest, and
      // the regular text sits between them. In light the ink is dark, so the
      // whole ladder runs the other way; the ORDER is what has to hold.
      const light = lum(dim) < 0.2;
      if (light) {
        expect(lum(dim), b.sel).toBeLessThan(lum(faint));
        expect(lum(faint), b.sel).toBeLessThan(lum(agent));
      } else {
        expect(lum(dim), b.sel).toBeGreaterThan(lum(faint));
        expect(lum(faint), b.sel).toBeGreaterThan(lum(agent));
      }
    }
  });

  // The steps have to be visible without being loud. The rail's own approved
  // heading-to-row distance is 1.336, so the note's two steps are held to that
  // family: above 1.2, where one emphasis stops reading, and below 2, where it
  // starts being a second voice rather than the same one said firmly.
  it('keeps both steps inside the family the rail already uses', () => {
    for (const b of ladders) {
      const [dim, faint, agent] = ['text-dim', 'text-faint', 'agent-ink'].map((n) => pick(b.body, n));
      expect(ratio(dim, faint), `emphasis in ${b.sel}`).toBeGreaterThan(1.2);
      expect(ratio(dim, faint), `emphasis in ${b.sel}`).toBeLessThan(2);
      expect(ratio(faint, agent), `finished in ${b.sel}`).toBeGreaterThan(1.2);
      expect(ratio(faint, agent), `finished in ${b.sel}`).toBeLessThan(2);
    }
  });

  // LOW-KEY IS NOT UNREADABLE. The rail draws on the window's own --bg, not on
  // a card. Measured: 5.50 to 1 in dark and
  // 4.29 in light, which is not a new number in this app — it is what the line
  // under the product name and every section label already sit at.
  it('is still readable against the ground it is drawn on', () => {
    for (const b of ladders) {
      if (/--skin-image:\s*url\(/.test(b.body)) continue;  // a picture has no one colour
      const faint = pick(b.body, 'text-faint');
      const bg = pick(b.body, 'bg');
      if (!bg) continue;
      expect(ratio(faint, bg), b.sel).toBeGreaterThan(4.2);
    }
  });

  it('never goes back to full ink, which is what made it shout', () => {
    for (const r of noteRules) expect(r.body, r.sel).not.toMatch(/color:\s*var\(--text\)/);
  });
});

describe('it does not get more complex than this', () => {
  it('has no toolbar, no box around it and no save chrome', () => {
    expect(bare).not.toMatch(/\.rail-note-toolbar|\.rail-note-saved|\.rail-note-button/);
    const wrap = noteRules.filter((r) => r.sel === '.rail-note-body > .ProseMirror');
    expect(wrap[0].body).not.toMatch(/border(?!-)|box-shadow/);
  });

  // THE COLUMN THIS IS DECLARED IN IS LOAD-BEARING, not tidiness. The wrapper
  // is a flex box only so the editor can be told to fill the height; as a ROW
  // it also sized the editor to its content, and `flex-shrink: 0` kept it
  // there, so one long line ran off the side of the panel. The description that
  // now opens the note is 83 characters and it ran 209px past the edge the
  // first time it was photographed.
  it('wraps rather than running off the side of a 298px column', () => {
    const wrap = noteRules.filter((r) => r.sel === '.rail-note-body');
    expect(wrap.length).toBe(1);
    expect(wrap[0].body).toMatch(/flex-direction:\s*column/);
    expect(declOf(ruleFor('> .ProseMirror'), 'word-break')).toBe('break-word');
  });

  it('animates nothing, anywhere in the note', () => {
    for (const r of noteRules) expect(r.body, r.sel).not.toMatch(/transition|animation/);
  });

  it('draws no bullet louder than the words beside it', () => {
    expect(declOf(ruleFor('li::marker'), 'color')).toBe('var(--text-faint)');
  });
});
