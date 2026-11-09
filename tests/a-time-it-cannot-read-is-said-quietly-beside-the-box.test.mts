// A time the schedule box could not read is said quietly, beside the box.
//
// What broke: typing "week" and pressing Enter drew a full-width sentence in
// the alert orange under the box ("Agentbox did not understand "week", so
// nothing was set. Try ..."). It read as the app breaking. The gray "not a
// time" beside the box was already saying the same thing in the place the eye
// was. Measured from the screenshot on the report: the orange line was
// `.snooze-refused`, coloured `var(--chip-ask)`.
//
// The rule: refusing stays (Enter on words it cannot read sets nothing), but
// the refusal is the preview's own line growing a short hint, in gray.

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { previewLine } from '../renderer/src/components/SchedulePicker';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const show = (ts) => `at ${ts}`;
const hint = 'try 3h, tomorrow, next week';

describe('the line beside the schedule box', () => {
  it('says nothing while the box is empty', () => {
    expect(previewLine('', null, false, show, hint)).toBeNull();
    expect(previewLine('   ', null, true, show, hint)).toBeNull();
  });

  it('shows the time it read', () => {
    expect(previewLine('3h', { value: 5, label: 'in 3h' }, false, show, hint))
      .toEqual({ text: 'at 5', tone: 'ok' });
  });

  it('says "not a time" while typing words it cannot read', () => {
    expect(previewLine('week', null, false, show, hint))
      .toEqual({ text: 'not a time', tone: 'unread' });
  });

  it('adds the hint once Enter was refused, still on that one line', () => {
    expect(previewLine('week', null, true, show, hint))
      .toEqual({ text: `not a time · ${hint}`, tone: 'refused' });
  });

  it('a readable time is never shown as refused', () => {
    expect(previewLine('3h', { value: 5, label: 'in 3h' }, true, show, hint).tone).toBe('ok');
  });
});

describe('no alarm colour for a typo', () => {
  const picker = read('../renderer/src/components/SchedulePicker.tsx');
  const css = read('../renderer/src/styles.css');

  it('the separate sentence under the box is gone', () => {
    expect(picker).not.toMatch(/snooze-refused/);
    expect(picker).not.toMatch(/so nothing was set/);
    expect(css).not.toMatch(/\.snooze-refused/);
  });

  it('the refused preview is gray, not the alert colour', () => {
    const rule = css.match(/\.snooze-preview\.refused\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/color:\s*var\(--text-dim\)/);
    expect(rule).not.toMatch(/chip-ask|red|orange|accent/);
  });
});
