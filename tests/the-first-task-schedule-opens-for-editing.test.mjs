// The schedule chip removed the rule from every click. Its label must open
// the shared date editor, with a separate button that clears only the schedule.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FirstTaskSchedule } from '../renderer/src/components/FirstRun';
import fs from 'node:fs';
import { landing } from '../renderer/src/first-run';

globalThis.React = React;
it('shows a task scheduled for later in Later after sending', () => {
  expect(landing('w-later', Date.now() + 3600000)).toEqual({ view: 'snoozed', select: 'w-later' });
  expect(landing('w-now', Date.now() - 1000)).toEqual({ view: 'progress', select: 'w-now' });
});
it('checks the folder onboarding was handed, from either picker', () => {
  const source = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
  expect(source).toContain('<FolderPicker');
  expect(source).toContain('api.chooseFolder(');
  expect(source).toContain('checkProjectFolder(folder');
});
describe('the first task schedule', () => {
  const draw = (value) => renderToStaticMarkup(React.createElement(FirstTaskSchedule, { value, onChange() {} }));
  it('offers an editor and a separate remove button for a repeat', () => {
    const html = draw({ runAt: 0, repeat: { every: 'day', at: '08:00' } });
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Remove schedule"');
    expect(html.match(/<button/g)).toHaveLength(2);
  });
  it('can edit a one-time date too', () => {
    expect(draw({ runAt: Date.now() + 3600000, repeat: null })).toContain('aria-haspopup="dialog"');
  });
  it('draws nothing for an unscheduled task', () => {
    expect(draw({ runAt: 0, repeat: null })).toBe('');
  });
});
