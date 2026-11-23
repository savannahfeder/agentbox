// THE CODEX LOGO IS CODEX'S OWN PURPLE (w-9687db6270, 2026-11-23).
//
// The founder, at setup's Pick your agent: "I'm pretty sure the Codex logo is
// the purple one." The mark was drawn in the text colour, black, beside
// Claude's in its own orange. Codex's coloured mark (Lobe Icons' codex-color,
// the set the shapes already came from) fills it with a gradient, #B1A7FF to
// #7A9DFF to #3941FF, top to bottom.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { EngineLogo } from '../renderer/src/components/EngineLogos';

const draw = (engine: 'claude' | 'codex') => renderToStaticMarkup(createElement('div', null, createElement(EngineLogo, { engine }), createElement(EngineLogo, { engine })));

describe("Codex's logo", () => {
  const html = draw('codex');
  it('is filled with its own purple to blue', () => {
    for (const stop of ['#B1A7FF', '#7A9DFF', '#3941FF']) expect(html).toContain(stop);
    expect(html).toMatch(/fill="url\(#[^)]+\)"/);
  });
  it('names its fill on each logo, so one taken off the page leaves the others coloured', () => {
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("Claude's logo", () => {
  it('stays its orange', () => {
    expect(draw('claude')).toContain('#D97757');
    expect(draw('claude')).not.toContain('linearGradient');
  });
});
