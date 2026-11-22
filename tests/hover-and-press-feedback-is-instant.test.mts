// HOVER AND PRESS FEEDBACK IS INSTANT, IN EVERY STYLESHEET.
//
// The founder: "They might have weird hover animations, for instance. With a
// lot of buttons, this animation takes a few hundred milliseconds before
// there's a shadow, but it's immediate." She wants it immediate. The first pass
// (hover-and-press-change-colour-in-the-same-frame) cleared eight stylesheets;
// counted across the rest of renderer/src, 47 transitions still eased a control's
// answer in over 60 to 200 ms: mentions, the projects page, the threads a
// thread made, the first run, sign-in, the chat's action bar and grips, the
// buttons that appear on a pointed-at row or card, and the look tiles' lift.
//
// Three checks over every renderer stylesheet but the tray's:
// - no rule eases a colour, a border, a shadow, an outline, a filter or `all`;
// - no :hover, :active or :focus rule declares a transition of its own;
// - nothing a :hover or :focus rule reveals or moves fades or slides in.
// What is left eased is named below with the reason it is not a control
// answering the pointer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../renderer/src');

const FEEDBACK = new Set([
  'all', 'color', 'background', 'background-color', 'border-color', 'box-shadow',
  'outline', 'outline-color', 'text-decoration-color', 'filter',
]);
const TIMING = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end', 'infinite']);
const POINTER = /:(hover|active|focus|focus-visible|focus-within)\b/;

// Kept on purpose. Each entry is a selector (exact, after whitespace is folded) and why.
const KEPT: Record<string, string> = {
  // A found line is marked, then the mark fades away by itself.
  '[data-line]': 'the mark on a found line fades out on its own',
  // The setup rows wash once when they change, then fade back; nothing points at them.
  '.cs-row': 'a setup row washes once when its state changes and fades back by itself',
  // A row just dragged into place washes and fades so the eye can find it; `.pp-row.moved` sets it at once.
  '.pp-row': 'the wash a just-moved project row fades out of',
  // The first run's step bars fill as the screens advance; they are not controls.
  // The sash brightens only once the pointer rests on it, as VS Code's does (her call, 2026-10-08).
  '.task-terminal-grip::before': 'the terminal sash lights only after the pointer rests, like VS Code',
  '.task-terminal-grip:hover::before': 'the terminal sash lights only after the pointer rests, like VS Code',
};

type Rule = { file: string; selector: string; body: string };

function rules(css: string, file: string): Rule[] {
  const out: Rule[] = [];
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ file, selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  }
  return out;
}

const splitTop = (list: string, by: string) => {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === by && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

function eased(body: string): string[] {
  const props: string[] = [];
  for (const d of body.matchAll(/(?:^|;)\s*transition(-property)?\s*:\s*([^;]+)/g)) {
    for (const part of splitTop(d[2].replace(/!important/, ''), ',')) {
      if (d[1]) { props.push(part); continue; }
      const name = splitTop(part, ' ').find((t) => /^[a-z-]+$/i.test(t) && !TIMING.has(t));
      if (name !== 'none') props.push(name ?? 'all');
    }
  }
  return props.filter((p) => p !== 'none');
}

const ownsTransition = (body: string) =>
  [...body.matchAll(/(?:^|;)\s*transition(?:-[a-z]+)?\s*:\s*([^;]+)/g)].some((d) => !/^\s*(none|0m?s)\b/.test(d[1]));

const lastCompound = (sel: string) => sel.replace(POINTER, '').split(/\s*[ >+~]\s*/).pop()!.replace(new RegExp(POINTER.source, 'g'), '');

function slowFeedback(all: Rule[]) {
  const found: string[] = [];
  const moving = new Map<string, string>();
  for (const r of all) {
    if (KEPT[r.selector]) continue;
    const props = eased(r.body);
    for (const p of props) if (FEEDBACK.has(p)) found.push(`${r.file}: ${r.selector} eases ${p}`);
    if (POINTER.test(r.selector) && ownsTransition(r.body)) found.push(`${r.file}: ${r.selector} carries its own transition`);
    for (const p of props) if (p === 'opacity' || p === 'transform' || p === 'height') {
      for (const s of splitTop(r.selector, ',')) moving.set(`${lastCompound(s)}|${p}`, `${r.file}: ${s}`);
    }
  }
  for (const r of all) {
    for (const s of splitTop(r.selector, ',')) {
      if (!POINTER.test(s)) continue;
      for (const p of ['opacity', 'transform', 'height']) {
        if (!new RegExp(`(?:^|;)\\s*${p}\\s*:`).test(r.body)) continue;
        const base = moving.get(`${lastCompound(s)}|${p}`);
        if (base) found.push(`${base} eases the ${p} that ${s} changes`);
      }
    }
  }
  return [...new Set(found)];
}

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === 'corner-tag' ? [] : walk(p); // the tray's look is approved as it is
  return e.name.endsWith('.css') ? [p] : [];
});

describe('slowFeedback', () => {
  const run = (css: string) => slowFeedback(rules(css, 'x.css'));

  it('finds a colour or shadow eased in, also inside a media query and as shorthand all', () => {
    expect(run('.a { transition: width .3s ease, background .14s; }')).toEqual(['x.css: .a eases background']);
    expect(run('@media (hover: hover) { .b { transition: box-shadow 0.2s; } }')).toEqual(['x.css: .b eases box-shadow']);
    expect(run('.c { transition: .2s; }')).toEqual(['x.css: .c eases all']);
    expect(run('.d { transition-property: border-color, transform; }')).toEqual(['x.css: .d eases border-color']);
  });

  it('finds a transition set on the hover or press rule itself', () => {
    expect(run('.a:hover { color: red; transition-duration: 120ms; }')).toEqual(['x.css: .a:hover carries its own transition']);
    expect(run('.a:active { transition: none; }')).toEqual([]);
  });

  it('finds a button that fades or lifts in under the pointer', () => {
    expect(run('.card .go { opacity: 0; transition: opacity .12s; } .card:hover .go { opacity: 1; }'))
      .toEqual(['x.css: .card .go eases the opacity that .card:hover .go changes']);
    expect(run('.tile { transition: transform .14s; } .look:hover .tile { transform: translateY(-1px); }'))
      .toEqual(['x.css: .tile eases the transform that .look:hover .tile changes']);
  });

  it('leaves motion that is not the pointer\'s answer alone', () => {
    expect(run('.bar { transition: width .3s; } .side { transition: opacity .14s; } .collapsed .side { opacity: 0; }')).toEqual([]);
    expect(run('.caret { transition: transform .12s; } .open .caret { transform: rotate(90deg); } .row:hover .caret { color: red; }')).toEqual([]);
    expect(run('/* transition: color .2s */ .a { color: red; }')).toEqual([]);
  });

  it('lets the named exceptions keep their timing', () => {
    expect(run('[data-line] { transition: background-color .5s ease, box-shadow .5s ease; }')).toEqual([]);
  });
});

describe('every renderer stylesheet but the tray\'s', () => {
  const files = walk(src);
  const all = files.flatMap((f) => rules(fs.readFileSync(f, 'utf8'), path.relative(src, f)));

  it('reads the stylesheets', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('answers hover, focus and press on the frame they happen', () => {
    expect(slowFeedback(all)).toEqual([]);
  });

  it('keeps each exception only while its rule still exists', () => {
    const selectors = new Set(all.map((r) => r.selector));
    expect(Object.keys(KEPT).filter((s) => !selectors.has(s))).toEqual([]);
  });
});
