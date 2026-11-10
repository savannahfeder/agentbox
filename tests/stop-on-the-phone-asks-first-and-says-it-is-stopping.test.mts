// STOP ON THE PHONE ASKS FIRST, AND SAYS IT IS STOPPING.
//
// What broke (phone tester, 2026-11-08): the reply box keeps one slot for Send
// and Stop, so the moment a reply went and the box emptied, Stop stood where
// Send had been. One tap stopped the agent with no question, and the slot then
// looked exactly as before, so nothing said the stop had gone. Read from the
// thread page's source, which these tests do not draw.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { planFor } from '../mobile/src/lib/actions';

const page = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');

describe('Stop', () => {
  it('opens a question rather than stopping', () => {
    expect(page).toMatch(/accessibilityLabel=\{thread\.running \? 'Stop this agent' : 'Stop this task'\}[^>]*onPress=\{\(\) => setSheet\('stop'\)\}|onPress=\{\(\) => setSheet\('stop'\)\}[^>]*accessibilityLabel=\{thread\.running/);
  });
  it('the question stops on one row and keeps it running on the other', () => {
    expect(page).toMatch(/<Sheet open=\{sheet === 'stop'\}/);
    expect(page).toMatch(/<SheetRow label="Stop the agent" onPress=\{\(\) => \{ setSheet\(null\); setStopping\(true\); stop\(\); \}\} \/>/);
    expect(page).toMatch(/<SheetRow label="Keep it running" onPress=\{\(\) => setSheet\(null\)\} \/>/);
  });
  it('once stopped, the slot says Stopping and cannot be pressed again', () => {
    expect(page).toMatch(/stopping \? 'Stopping…' : 'Stop'/);
    expect(page).toMatch(/disabled=\{stopping\}/);
  });
  it('and lets go of that once the thread no longer offers Stop', () => {
    expect(page).toMatch(/useEffect\(\(\) => \{ if \(!offers\.stop\) setStopping\(false\); \}, \[offers\.stop\]\)/);
  });
});

describe('the toast after a stop', () => {
  // It read "Stop sent. Your computer stops the agent when it gets it.", cut off on one line, and wrong for a cloud run.
  it('is short enough for one line and true wherever the agent runs', () => {
    const toast = planFor({ kind: 'stop' }, { product: 'p', id: 'w-1', status: 'claimed' })!.toast!;
    expect(toast).toBe('Stopping the agent');
    expect(toast).not.toMatch(/computer/);
  });
});
