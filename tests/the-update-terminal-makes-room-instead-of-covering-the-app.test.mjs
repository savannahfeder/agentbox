// Clicking "Update now" for Codex opened its terminal as a fixed layer over the
// bottom of the window (w-a6b1fff197, 2026-10-01). The panel was portaled to
// <body> at `position:fixed; bottom:16px; max-height:60vh; z-index:20000`, so
// on her screenshot it covered the lower ~30% of the card she was reading, its
// RESULT included, and nothing under it could be clicked until she closed it.
//
// The panel is now a dock in the page's own flow: the app and the panel share
// one column the height of the window, the app takes what is left, and opening
// the panel shrinks the app instead of hiding part of it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { AgentUpdates } from '../renderer/src/components/AgentUpdates.tsx';

const css = postcss.parse(readFileSync('renderer/src/styles.css', 'utf8'));
const decls = (selector) => {
  const out = {};
  css.walkRules((r) => { if (r.selector === selector) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};

describe('the update terminal makes room instead of covering the app', () => {
  it('puts the app inside a column it shares with the panel', () => {
    const html = renderToStaticMarkup(createElement(AgentUpdates, null, createElement('div', { className: 'app' })));
    expect(html).toMatch(/^<div class="agent-update-host"><div class="agent-update-app"><div class="app"><\/div><\/div><\/div>$/);
  });

  it('keeps that column the height of the window, with the app taking what is left', () => {
    expect(decls('.agent-update-host')).toMatchObject({ height: '100%', display: 'flex', 'flex-direction': 'column' });
    const app = decls('.agent-update-app');
    expect(app.flex).toBe('1 1 0');
    expect(app['min-height']).toBe('0');
  });

  it('draws the panel in the flow, never floating over the app', () => {
    const panel = decls('.agent-update-panel');
    expect(panel.position ?? 'static').not.toMatch(/fixed|absolute/);
    expect(panel['z-index']).toBeUndefined();
    expect(panel.flex).toBe('none');
    // Still capped, so a long install log cannot push the app off the screen.
    expect(panel['max-height']).toBe('60vh');
  });

  it('does not lift the panel out of the column into <body>', () => {
    const src = readFileSync('renderer/src/components/AgentUpdates.tsx', 'utf8');
    expect(src).not.toMatch(/createPortal/);
  });
});
