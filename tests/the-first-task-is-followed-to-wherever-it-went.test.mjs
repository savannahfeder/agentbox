// Pressing Enter on "Which project is it for?" showed nothing for the two
// seconds the folder window took to open. After the folder was picked the
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

describe('the project screen while it works', () => {
  const source = read('renderer/src/components/FirstRun.tsx');
  const where = source.slice(source.indexOf("{screen === 'where' && ("));

  it('says the folder window is opening from the moment Enter is pressed', () => {
    const choose = source.slice(source.indexOf('const chooseAnother = useCallback'), source.indexOf('const pickPlace = useCallback'));
    expect(choose.indexOf('setOpening(true)')).toBeGreaterThan(-1);
    expect(choose.indexOf('setOpening(true)')).toBeLessThan(choose.indexOf('await api.chooseFolder'));
    expect(choose).toContain('setOpening(false)');
    expect(where).toContain('Opening the folder window…');
  });

  it('says the task is being sent once a folder is picked', () => {
    expect(where).toContain('Sending…');
  });

  it('ignores Enter while either is under way', () => {
    const keys = source.slice(source.indexOf("if (screen === 'where') {"), source.indexOf("if (screen === 'task') {"));
    expect(keys).toContain('if (busy || opening) return;');
  });
});

describe('the inbox after the first task is sent', () => {
  const app = read('renderer/src/App.tsx');

  it('moves to the tab the sent thread is in, so a task that could not start is not hidden', () => {
    const follow = app.slice(app.indexOf('const landAt = landOn'), app.indexOf("// ↵ beside the row you are on"));
    expect(follow).toMatch(/tabOfState\(tabState\.get\(landOn\) \?\? null\)/);
    expect(follow).toContain('setView(tab)');
  });

  it('says the task is starting, not that nothing is running, until its row arrives', () => {
    // `justSent` since F-134: every other send gets the same line, not only
    // the walk's landing (tests/the-progress-tab-says-a-task-is-starting-until-its-row-arrives).
    expect(app).toContain('<EmptyTab view={view} starting={!!landOn || justSent}');
    const draw = (props) => renderToStaticMarkup(React.createElement(EmptyTab, props));
    expect(draw({ view: 'progress', starting: true })).toContain('Starting your task…');
    expect(draw({ view: 'progress', starting: false })).toContain('Nothing is running.');
    expect(draw({ view: 'done', starting: true })).not.toContain('Starting your task…');
  });
});
