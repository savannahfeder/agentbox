// After the first task was sent the
// inbox opened on In progress reading "Nothing is running.", because the task
// could not be given a folder and had gone straight to Needs you. Found by
// walking the onboarding as a new user on a Mac, 2026-10-28.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyTab } from '../renderer/src/threads/Pages';

globalThis.React = React;
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the inbox after the first task is sent', () => {
  const app = read('renderer/src/App.tsx');

  // Since w-31c71743b5 the first task is sent from the tutorial on the inbox.
  // The founder, 2026-10-29: "it ended up going pretty quickly to Needs you
  // ... I'm just sitting here and there's no clear next step. When it goes
  // back to Needs You, it should probably help you with that navigation."
  it('moves to the tab the sent thread is in, so a task that could not start is not hidden', () => {
    const follow = app.slice(app.indexOf('// THE FIRST THREAD, FOLLOWED'), app.indexOf('// END OF THE FOLLOWING'));
    expect(follow).toMatch(/tabOfState\(tabState\.get\(firstThread\) \?\? null\)/);
    expect(follow).toContain('setView(tab)');
  });

  it('moves only when the thread changes tab, so it never pulls you back from where you went', () => {
    const follow = app.slice(app.indexOf('// THE FIRST THREAD, FOLLOWED'), app.indexOf('// END OF THE FOLLOWING'));
    expect(follow).toContain('if (tab === followedTab.current) return;');
  });

  it('keeps following while you look inside it, and moves once you are back on the list', () => {
    // Measured 2026-10-29 by the end-to-end walk: opening the first thread while
    // its agent worked stopped the following, and its answer was left unshown.
    const follow = app.slice(app.indexOf('// THE FIRST THREAD, FOLLOWED'), app.indexOf('// END OF THE FOLLOWING'));
    expect(follow).toContain("if (focused || !(modal === null || modal === 'compose') || !(['inbox', 'progress'] as View[]).includes(view)) return;");
    expect(app).not.toContain('useEffect(() => { if (focused) setFirstThread(null); }, [focused]);');
  });

  it('never leads to Done or Later, and stops once you have read its answer', () => {
    // Measured 2026-10-29 by the end-to-end walk: closing the first thread with
    // E took the window to Done, away from the command bar tip.
    const follow = app.slice(app.indexOf('// THE FIRST THREAD, FOLLOWED'), app.indexOf('// END OF THE FOLLOWING'));
    expect(follow).toContain("if (tab !== 'inbox' && tab !== 'progress') { setFirstThread(null); return; }");
    expect(follow).toContain("if (focused?.id === firstThread && tab === 'inbox') { setFirstThread(null); return; }");
  });

  it("is the tutorial's first thread", () => {
    expect(app).toContain('if (firstSend.current && made?.id) { firstSend.current = false; setFirstThread(made.id); }');
  });

  it('says the task is starting, not that nothing is running, until its row arrives', () => {
    // `justSent` since F-134: every other send gets the same line, not only
    // the walk's landing (tests/the-progress-tab-says-a-task-is-starting-until-its-row-arrives).
    expect(app).toContain('<EmptyTab view={view} starting={!!landOn || justSent} waiting={needsYouCount.inbox} />');
    const draw = (props) => renderToStaticMarkup(React.createElement(EmptyTab, props));
    expect(draw({ view: 'progress', starting: true })).toContain('Starting your task…');
    expect(draw({ view: 'progress', starting: false })).toContain('Nothing is running.');
    expect(draw({ view: 'done', starting: true })).not.toContain('Starting your task…');
  });

  it('draws the lattice beside it, so the wait reads as work', () => {
    // The founder, 2026-10-29: "it would be nice to have a loading sign there,
    // maybe the classic one that we've got at the beginning of the flow".
    const draw = (props) => renderToStaticMarkup(React.createElement(EmptyTab, props));
    expect(draw({ view: 'progress', starting: true })).toContain('live-mark');
    expect(draw({ view: 'progress', starting: false })).not.toContain('live-mark');
  });
});
