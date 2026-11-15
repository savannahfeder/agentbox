// 2026-09-19: keep one animated status, replace generic Working with the actual
// command (Thinking between tools), and put command detail behind a disclosure.
import { it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Live } from '../renderer/src/components/Live';
globalThis.React=React;
const draw=activity=>renderToStaticMarkup(React.createElement(Live,{item:{id:'w',status:'open'},facts:{session:{startedAt:Date.now(),activity,tail:[]}}}));
it('shows the current command with an accessible disclosure',()=>{const html=draw([{id:'a',label:'Running npm test',detail:'npm test',startedAt:Date.now()}]);expect(html).toContain('Running npm test');expect(html).toContain('aria-expanded="false"');expect(html).not.toContain('<pre');expect(html.match(/is-shimmering/g)).toHaveLength(1);});
it('falls back to Thinking rather than guessing from an old tool',()=>{expect(draw([])).toContain('Thinking');expect(draw(undefined)).toContain('Thinking');});
