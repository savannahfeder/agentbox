// NO BUTTON ON THE PHONE SITS INSIDE ANOTHER BUTTON.
//
// Two synthetic testers on 2026-11-08 met a red "<button> cannot contain a
// nested <button>" box over the inbox, the ticked-threads bar and a group's
// message field, after sending a thread. The toast that names a thread was one
// Pressable holding its Undo and Dismiss Pressables; on the web every Pressable
// with a button role is a <button>, and React refuses one inside another. This
// reads every screen of the phone app and fails on a Pressable opened inside
// one that is still open.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'mobile', 'src');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : e.name.endsWith('.tsx') ? [p] : [];
  });
}

/** Line numbers where a Pressable opens inside one with a role, which the web draws as a <button>. A role-less
 *  Pressable is a <div> there, and may hold one. */
export function nestedPressables(text) {
  const out = [];
  const stack = [];
  const tags = /<Pressable\b((?:[^<>]|=>|<(?!\/?Pressable\b)[^<>]*>)*?)(\/?)>|<\/Pressable>/g;
  for (const m of text.matchAll(tags)) {
    if (m[0] === '</Pressable>') { stack.pop(); continue; }
    if (stack.some(Boolean)) out.push(text.slice(0, m.index).split('\n').length);
    if (m[2] !== '/') stack.push(/\b(accessibilityRole|role)=/.test(m[1]));
  }
  return out;
}

describe('a button inside a button', () => {
  it('is found when there is one, and not when buttons sit side by side', () => {
    expect(nestedPressables('<Pressable accessibilityRole="button" onPress={a}>\n<Pressable onPress={b} />\n</Pressable>')).toEqual([2]);
    expect(nestedPressables('<Pressable onLongPress={a}>\n<Pressable accessibilityRole="button" onPress={b} />\n</Pressable>')).toEqual([]);
    expect(nestedPressables('<Pressable onPress={a}>x</Pressable>\n<Pressable onPress={() => b()} />')).toEqual([]);
    expect(nestedPressables('<Pressable style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>\n<T>x</T>\n</Pressable>\n<Pressable />')).toEqual([]);
  });

  it('is nowhere on the phone', () => {
    const found = files(src).flatMap((f) => nestedPressables(fs.readFileSync(f, 'utf8')).map((line) => `${path.relative(root, f)}:${line}`));
    expect(found).toEqual([]);
  });
});
