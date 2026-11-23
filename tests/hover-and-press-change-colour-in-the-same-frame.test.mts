// HOVER AND PRESS CHANGE COLOUR IN THE SAME FRAME.
//
// Buttons, tabs, rows and cards eased their hover and pressed colours in over
// 80 to 200 ms (`transition: color 0.14s, background 0.14s` and the like), so
// the pointer always arrived before the control answered it. Superhuman and
// Cron change a control's colour on the frame the pointer reaches it; ours
// read as a fraction of a second behind. Counted in the stylesheets: 85 such
// transitions across the inbox, the thread, the sidebar and the settings.
//
// A colour, a background, a border or an underline now changes at once.
// Movement and fades that are not a control's answer to the pointer (a size, a
// slide, an opacity, the moment a found line is marked) keep their timing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const FILES = [
  'styles.css', 'threads/pages.css', 'workspace-navigation.css', 'one-thing-at-a-time.css',
  'threads/thread-composer.css', 'components/settings.css', 'files/files-place.css', 'connections/connections.css',
];
const COLOUR = new Set(['color', 'background', 'background-color', 'border-color', 'text-decoration-color', 'outline-color', 'box-shadow', 'all']);
// Marks that fade out by themselves after the fact, not a control's answer to the pointer.
const FADES = [/^\[data-line\]$/, /^\.cs-row$/, /^\.folder-preview/];

const split = (list: string) => {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

function colourTransitions(css: string) {
  const found: { selector: string; property: string }[] = [];
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    for (const d of m[2].matchAll(/(?:^|;)\s*transition(-property)?\s*:\s*([^;]+)/g)) {
      for (const part of split(d[2])) {
        const property = part.split(/\s+/)[0];
        if (COLOUR.has(property) && !FADES.some((f) => f.test(selector))) found.push({ selector, property });
      }
    }
  }
  return found;
}

describe('colourTransitions', () => {
  it('finds a colour eased in, among other properties and inside a media query', () => {
    expect(colourTransitions('.a { transition: width .3s ease, background .14s; }')).toEqual([{ selector: '.a', property: 'background' }]);
    expect(colourTransitions('@media (hover: hover) { .b:hover { color: red; transition: color 0.14s; } }')).toEqual([{ selector: '.b:hover', property: 'color' }]);
    expect(colourTransitions('.c{transition:border-color .12s cubic-bezier(.2, 0, 0, 1)}')).toEqual([{ selector: '.c', property: 'border-color' }]);
  });

  it('leaves movement, fades and an override to none alone', () => {
    expect(colourTransitions('.a { transition: width .3s ease, transform 0.05s; } .b { transition: opacity .12s; } .c { transition: none; }')).toEqual([]);
  });

  it('ignores a transition named only in a comment', () => {
    expect(colourTransitions('/* transition: color .2s */ .a { color: red; }')).toEqual([]);
  });

  it('lets the marks that fade by themselves keep their fade', () => {
    expect(colourTransitions('[data-line] { transition: background-color .5s ease, box-shadow .5s ease; }')).toEqual([]);
  });
});

describe('the app\'s stylesheets', () => {
  for (const f of FILES) {
    it(`${f} changes colour on the frame the pointer arrives`, () => {
      const css = readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
      expect(colourTransitions(css)).toEqual([]);
    });
  }
});
