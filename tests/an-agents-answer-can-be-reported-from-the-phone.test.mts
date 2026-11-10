// AN AGENT'S ANSWER CAN BE REPORTED FROM THE PHONE.
//
// App Review guideline 1.2 now names AI content creation apps: an app that
// shows generated content needs a way to report it. Both Claude reviewers on
// the app review board (2026-11-08) found none in the phone app: the only route
// was Settings › General › Send feedback, with nothing saying which answer.
// Now a thread's menu has "Report this thread", which opens the feedback page
// already naming the thread, and what is sent says which thread it is.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { reportText } from '../mobile/src/lib/report';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

describe('what a report sends', () => {
  it('names the thread, then the words', () => {
    expect(reportText({ ref: 'agentbox/w-1', title: 'Fix sign-in' }, 'It wrote something rude')).toBe('Report about thread agentbox/w-1 ("Fix sign-in")\n\nIt wrote something rude');
  });
  it('a thread with no title is named by its id alone', () => {
    expect(reportText({ ref: 'agentbox/w-1', title: '' }, 'x')).toBe('Report about thread agentbox/w-1\n\nx');
  });
  it('feedback that is not a report goes as it was typed', () => {
    expect(reportText(null, 'The list is slow')).toBe('The list is slow');
  });
});

describe('the screens', () => {
  it('the thread menu offers it on every thread, closed ones too', () => {
    const menu = read('ui/ThreadMenu.tsx');
    expect(menu).toMatch(/<SheetRow label="Report this thread"/);
    expect(menu.indexOf('Report this thread')).toBeGreaterThan(menu.indexOf('{!closed && <>'));
    expect(menu.slice(menu.indexOf('Report this thread') - 40, menu.indexOf('Report this thread'))).not.toMatch(/!closed &&/);
  });
  it('the thread opens the feedback page naming itself', () => {
    expect(read('app/thread/[product]/[id].tsx')).toMatch(/onReport=\{\(\) => router\.push\(\{ pathname: '\/settings\/feedback', params: \{ report: `\$\{product\}\/\$\{id\}`, title: item\.title \?\? '', answer: /);
  });
  it('the feedback page says it is a report and sends it as one', () => {
    expect(read('app/settings/feedback.tsx')).toMatch(/title=\{report \? 'Report this thread' : 'Send feedback'\}/);
    expect(read('ui/FeedbackPage.tsx')).toMatch(/c\.sendFeedback\(reportText\(about, text\)/);
  });
});
