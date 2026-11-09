// AN AI TEAMMATE IN TO HANGS ITS MARK LEFT OF ITS NAME, LIKE A PERSON OR AN AGENT.
//
// To on the new-thread card hangs the recipient's face in the gutter left of
// the value, so "Auto", "Maya Chen" and "Opus 5.5" all start on one line.
// The rule named a person's face (.tm-av) and an agent's (.agent-face) but not
// a teammate's dashed letter (.tq), so picking "Head of Marketing" put the
// mark inline: measured in the built card at 1512x945, the name started at
// x=537 against 513 for "Auto", with 0px between the mark and the name.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/threads/thread-composer.css'), 'utf8');

// Every rule as [selectors, { prop: value }], comments stripped.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => [
  sel.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  Object.fromEntries(body.split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d.length === 2 && d[0])),
]);
const declsFor = (selector) => Object.assign({}, ...rules.filter(([sels]) => sels.includes(selector)).map(([, d]) => d));

describe('a teammate in To', () => {
  it('hangs its mark in the gutter the way a person\'s face hangs', () => {
    const person = declsFor('.tc-word > .tm-av');
    const mate = declsFor('.tc-word > .tq');
    expect(person['margin-left']).toBe('-27px');
    expect(mate['margin-left']).toBe(person['margin-left']);
    expect(mate['margin-right']).toBe(person['margin-right']);
    expect(mate.top).toBe(person.top);
  });

  it('leaves the mark alone in the bar\'s chip, where the gap already spaces it', () => {
    expect(declsFor('.tc-chip > .tq')['margin-left']).toBeUndefined();
  });
});
