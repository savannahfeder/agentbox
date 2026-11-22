// "On mobile it's really hard to see any pictures you might have attached
// because the keyboard takes up a lot of space. They look like they haven't
// been attached." On the phone app's New thread page the picked pictures sat
// under the message box, inside the part that scrolls. In the browser preview
// at an iPhone 16's size less its keyboard (393x516), the thumbnail began at
// 486 and ended at 570, behind the keyboard. They now sit on the Attach bar's
// edge, which stays above the keyboard, in one row that scrolls sideways, so
// a few pictures do not push the message away.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f: string) => fs.readFileSync(new URL(`../mobile/src/${f}`, import.meta.url), 'utf8');
const form = read('ui/NewThreadForm.tsx');
const page = read('app/new.tsx');
const attach = read('ui/Attach.tsx');
const bodyOf = (src: string, name: string) => {
  const at = src.indexOf(`export function ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const next = src.indexOf('\nexport function ', at + 1);
  return src.slice(at, next < 0 ? undefined : next);
};

describe('a picture attached to a new thread on the phone', () => {
  it('waits on the Attach bar, not under the message box', () => {
    expect(bodyOf(form, 'NewThreadFields')).not.toContain('<Attached');
    const foot = bodyOf(form, 'NewThreadFoot');
    expect(foot).toContain('<Attached files={draft.files}');
    // Over the bar's row of buttons, so it is the first thing above the keyboard.
    expect(foot.indexOf('<Attached')).toBeLessThan(foot.indexOf('accessibilityLabel="Attach a file or picture"'));
  });

  it('says a file is too big, and why a pick failed, in the same place', () => {
    expect(bodyOf(form, 'NewThreadFields')).not.toMatch(/draft\.dropped|\{error &&/);
    expect(bodyOf(form, 'NewThreadFoot')).toMatch(/draft\.dropped > 0[\s\S]*\{error &&/);
  });

  it('is outside the part of the page the keyboard scrolls away', () => {
    const scroll = page.slice(page.indexOf('<ScrollView'), page.indexOf('</ScrollView>'));
    expect(scroll).toContain('<NewThreadFields');
    expect(scroll).not.toContain('<NewThreadFoot');
    expect(page.indexOf('<NewThreadFoot')).toBeGreaterThan(page.indexOf('</ScrollView>'));
    expect(page.indexOf('<NewThreadFoot')).toBeLessThan(page.indexOf('</KeyboardAvoidingView>'));
  });

  it('nothing is shown on the bar while no file is picked', () => {
    expect(attach).toMatch(/if \(!files\.length\) return null;/);
    expect(bodyOf(form, 'NewThreadFoot')).toMatch(/\{\(draft\.files\.length > 0 \|\| draft\.dropped > 0 \|\| !!error \|\| \(!talk\.on && !!talk\.problem\)\) && \(/);
  });
});

describe('several pictures waiting to go', () => {
  it('stay one row high and scroll sideways, in every attach box', () => {
    const attached = attach.slice(attach.indexOf('export function Attached('));
    expect(attached).toMatch(/<ScrollView horizontal/);
    expect(attached).not.toContain("flexWrap: 'wrap'");
  });
});
