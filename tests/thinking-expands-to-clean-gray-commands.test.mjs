// 2026-09-19: the founder saw prose instead of command history and a gap
// before the time. Measure tool-only rows, empty boundaries, and
// time-before-chevron.
import { it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Live } from '../renderer/src/components/Live';
import { runNodes } from '../renderer/src/item-thread';
import { previewFocus } from '../renderer/src/preview-focus';
globalThis.React = React;
it('keeps recorded commands distinct from agent prose', () => {
 const nodes = runNodes({startedAt:Date.now(),text:'12:00:00  I am checking now\n12:00:01  [Bash] npm test\n12:00:02  [Read] src/app.ts'});
 expect(nodes.filter(n=>n.kind==='work').map(n=>n.subject)).toEqual(['npm test','src/app.ts']);
 expect(runNodes({startedAt:Date.now(),text:''})).toEqual([]);
});
it('puts elapsed time inside the control before its chevron', () => {
 const html=renderToStaticMarkup(React.createElement(Live,{item:{id:'w',status:'open'},facts:{session:{startedAt:Date.now()-180000,activity:[],tail:[]}}}));
 expect(html.indexOf('live-span')).toBeLessThan(html.indexOf('live-chevron'));
 expect(html.indexOf('live-span')).toBeLessThan(html.indexOf('</button>'));
});
it('opens a specific preview task without changing ordinary focus behavior', () => {
 const rows=[{id:'a'},{id:'b'}];
 expect(previewFocus('?fixtures=1&focus=b',rows,[rows[0]])).toBe(rows[1]);
 expect(previewFocus('?focus=1',rows,[rows[0]])).toBe(rows[0]);
 expect(previewFocus('?focus=b',rows,[rows[0]])).toBeUndefined();
 expect(previewFocus('?fixtures=1&focus=missing',rows,[])).toBeUndefined();
});
import { previousActivity } from '../renderer/src/activity-summary';
it('does not call the current command completed or erase earlier repeats', () => {
 const rows=[{subject:'npm test'},{subject:'git status'},{subject:'npm test'}];
 expect(previousActivity(rows,[{detail:'npm test'}])).toEqual(rows.slice(0,2));
 expect(previousActivity(rows,[])).toEqual(rows);
 expect(previousActivity(rows,[{detail:'npm build'}])).toEqual(rows);
});
