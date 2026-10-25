// THERE WAS NO WAY TO SAY "NOT THAT ONE" (w-93b3a1a796). Asked for: "In the
// agent tray it'd be really nice to be able to X out one of the agents...
// sometimes I'm like, okay I don't really care about that one. Can you just
// check it off... I don't need to be reminded of that."
//
// Each line of the tray's list now has an X. It takes that thread off the
// tray, and only the tray: the thread stays in Needs you. It stays off across
// a restart, and comes back only when the thread has something newer than the
// moment it was crossed off, or after it has left Needs you and come back.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notDismissed } from '../shared/corner-tag.mjs';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minute = 60_000;

describe('what is left once you cross some off', () => {
  const at = Date.UTC(2026, 9, 23, 20, 0, 0);

  it('leaves out a thread crossed off since its last answer, and keeps the rest', () => {
    const list = [{ id: 'a', since: at - minute }, { id: 'b', since: at - minute }];
    expect(notDismissed(list, { a: at }).map((r) => r.id)).toEqual(['b']);
  });

  it('brings a thread back when it has something newer than the moment it was crossed off', () => {
    expect(notDismissed([{ id: 'a', since: at + 1 }], { a: at })).toHaveLength(1);
    expect(notDismissed([{ id: 'a', since: at }], { a: at })).toHaveLength(0);
  });

  it('leaves everything when nothing is crossed off', () => {
    const list = [{ id: 'a', since: at }];
    expect(notDismissed(list, {})).toEqual(list);
    expect(notDismissed(list, undefined)).toEqual(list);
  });
});

const T = 1_000_000_000;
const waiting = (since, id) => ({ id, title: id, says: 'is ready for you', since });
const two = { ready: [waiting(T - minute, 'pricing'), waiting(T - 2 * minute, 'login')], working: 3 };

function upWithTwo(config = {}) {
  config.cornerTagLookedAt ??= T - 10 * minute;
  const r = cornerTagRig({ at: T, config });
  r.hand(two);
  r.pageUp();
  r.call('corner-tag:toggle');
  r.pageUp('card', { width: 300, height: 120 });
  return r;
}

describe('the X on a line of the tray\'s list', () => {
  it('takes that thread off the count and the list, and leaves the other', () => {
    const r = upWithTwo();
    r.call('corner-tag:dismiss', 'pricing');
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['login']);
    expect(r.lastState('card').ready.map((x) => x.id)).toEqual(['login']);
    expect(r.win().visible).toBe(true);
  });

  it('takes the tray away when the last one is crossed off', () => {
    const r = upWithTwo();
    r.call('corner-tag:dismiss', 'pricing');
    r.call('corner-tag:dismiss', 'login');
    expect(r.win().visible).toBe(false);
    expect(r.win('card').visible).toBe(false);
  });

  it('keeps it off across a restart', () => {
    const config = {};
    const r = upWithTwo(config);
    r.call('corner-tag:dismiss', 'pricing');
    expect(config.cornerTagDismissed).toEqual({ pricing: T });
    const again = cornerTagRig({ at: T + minute, config });
    again.hand(two);
    again.pageUp();
    expect(again.lastState().ready.map((x) => x.id)).toEqual(['login']);
  });

  it('brings it back when its agent answers again', () => {
    const r = upWithTwo();
    r.call('corner-tag:dismiss', 'pricing');
    r.advance(5 * minute);
    r.hand({ ready: [waiting(r.clock(), 'pricing'), waiting(T - 2 * minute, 'login')], working: 3 });
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['pricing', 'login']);
  });

  it('forgets it once the thread leaves Needs you, so it counts if it comes back', () => {
    const config = {};
    const r = upWithTwo(config);
    r.call('corner-tag:dismiss', 'pricing');
    r.hand({ ready: [waiting(T - 2 * minute, 'login')], working: 3 });
    expect(config.cornerTagDismissed).toEqual({});
    r.hand(two);
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['pricing', 'login']);
  });

  it('leaves the thread itself alone: nothing is sent to the app', () => {
    const r = upWithTwo();
    r.call('corner-tag:dismiss', 'pricing');
    expect(r.main.sent).toEqual([]);
  });

  it('ignores an X for a thread the tray is not showing', () => {
    const config = {};
    const r = upWithTwo(config);
    r.call('corner-tag:dismiss', 'not-here');
    r.call('corner-tag:dismiss', null);
    expect(config.cornerTagDismissed ?? {}).toEqual({});
    expect(r.lastState().ready).toHaveLength(2);
  });
});

describe('the page draws the X', () => {
  const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'main/corner-tag-preload.cjs'), 'utf8');

  it('puts an X on each line that crosses that thread off, named for anyone reading aloud', () => {
    expect(page).toMatch(/className="ct-x"/);
    expect(page).toMatch(/aria-label=\{`Clear \$\{l\.title\} from the tray`\}/);
    expect(page).toMatch(/bridge\?\.dismiss\(l\.id\)/);
    expect(preload).toMatch(/dismiss: \(id\) => ipcRenderer\.invoke\('corner-tag:dismiss', id\)/);
  });

  // The X stands where the time was, so a line does not grow or shift when it
  // is pointed at, and nothing is drawn on a line nobody is pointing at.
  it('shows the X only on the line you point at, in place of how long it has waited', () => {
    expect(css).toMatch(/\.ct-row:hover \.ct-x[^{]*\{[^}]*opacity:\s*1/);
    expect(css).toMatch(/\.ct-row:hover \.ct-when[^{]*\{[^}]*visibility:\s*hidden/);
    expect(css).toMatch(/\n\.ct-x \{[^}]*opacity:\s*0/);
  });
});
