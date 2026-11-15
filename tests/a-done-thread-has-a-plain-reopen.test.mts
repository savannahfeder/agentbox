// 2026-10-31: Dev found Maya's task marked done by a stray key 45
// minutes later. The thread's menu offered only Rename; the only way back was
// to reply into it, which reopened it without saying so. Measured by drawing
// the thread's bar for a done thread and an open one, and by reading where its
// press goes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadMenu } from '../renderer/src/threads/ThreadMenu.tsx';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const bar = (props) => renderToStaticMarkup(React.createElement(ThreadMenu, props));

describe('the bar of a thread', () => {
  it('done, offers Reopen where Done was', () => {
    const html = bar({ onFinish: null, onReopen: () => {}, onRename: () => {} });
    expect(html).toMatch(/>Reopen</);
  });
  it('open, offers Done and no Reopen', () => {
    const html = bar({ onFinish: () => {}, onReopen: null });
    expect(html).not.toMatch(/Reopen/);
    expect(html).toMatch(/ts-done/);
  });
});

describe('the wiring', () => {
  it('a done thread that is not an agent row is handed a reopen that opens it again', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/onReopen=\{!canFinish && !agent \? onReopenDone/);
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/onReopenDone=\{\(\) => reopenDone\(focused\)\}/);
    const fn = app.slice(app.indexOf('const reopenDone = useCallback'), app.indexOf('const reopenDone = useCallback') + 900);
    expect(fn).toMatch(/status: 'open'/);
    expect(fn).toMatch(/pushUndo/);
  });
});
