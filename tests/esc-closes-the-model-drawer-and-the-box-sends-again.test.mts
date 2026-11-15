// Two keys, both reported twice (power test w-811757c0b5 run 2, issues 13 and
// 23). "Esc does not close the reply model picker after picking an effort...
// In the new-thread composer Esc did close it." And then: "Cmd+Enter does
// nothing after closing the reply model picker with Esc. The cursor is no
// longer in the box after Esc so the keys go nowhere and nothing says so."
//
// One cause each, and they are the same shape. Escape lived on the drawer's
// TRIGGER WORD, so it only ever arrived while that word had focus; clicking
// High under Effort moves focus onto the effort button, where Escape reached
// nobody. And every way of closing the drawer left focus on a button that had
// just been unmounted, which is the body, and ⌘↵ sends from the reply box.
//
// So the keys are decided in one place now, by a pure function that knows
// whether the press came from the word or from inside the open drawer, and the
// box takes focus back whenever the drawer shuts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { modelDrawerKey } from '../renderer/src/model-drawer-keys.ts';

const press = (key) => ({ key });
const inside = (key, open = true) => modelDrawerKey(press(key), { open, from: 'inside' });
const word = (key, open = true) => modelDrawerKey(press(key), { open, from: 'word' });

describe('Escape closes the drawer from anywhere in it', () => {
  it('closes it after she has picked an effort', () => {
    expect(inside('Escape')).toBe('close');
  });

  it('closes it from the word itself, as it always did', () => {
    expect(word('Escape')).toBe('close');
  });

  it('leaves Escape alone when the drawer is already shut', () => {
    // The reply box's own Escape folds the box or blurs it. A drawer that is
    // not open must not eat that.
    expect(word('Escape', false)).toBeNull();
    expect(inside('Escape', false)).toBeNull();
  });
});

describe('every other key inside the drawer belongs to the button it is on', () => {
  it('leaves Enter to the effort button under the cursor', () => {
    // Enter on the word picks the model row; Enter on a level sets the level.
    // One handler for both would do both at once.
    expect(inside('Enter')).toBeNull();
    expect(word('Enter')).toBe('pick');
  });

  it('leaves the arrows and Space alone inside the drawer', () => {
    expect(inside('ArrowDown')).toBeNull();
    expect(inside('ArrowUp')).toBeNull();
    expect(inside(' ')).toBeNull();
    expect(inside('Tab')).toBeNull();
  });

  it('still walks the model rows from the word', () => {
    expect(word('ArrowDown')).toBe('down');
    expect(word('ArrowUp')).toBe('up');
  });

  it('opens from the word on the keys it always opened on', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ']) {
      expect(modelDrawerKey(press(key), { open: false, from: 'word' })).toBe('open');
    }
    expect(modelDrawerKey(press('a'), { open: false, from: 'word' })).toBeNull();
  });

  it('never opens the drawer from inside a drawer that is shut', () => {
    expect(inside('Enter', false)).toBeNull();
  });
});

describe('the wiring is there, in both boxes that draw the drawer', () => {
  const model = fs.readFileSync(new URL('../renderer/src/components/Model.tsx', import.meta.url), 'utf8');
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

  it('asks the one function on both the word and the drawer', () => {
    expect(model).toContain("import { modelDrawerKey } from '../model-drawer-keys';");
    expect(model.match(/modelDrawerKey\(/g)?.length).toBe(2);
    expect(model).toContain("from: 'inside'");
    expect(model).toContain("from: 'word'");
  });

  it('hands focus back to the reply box when the drawer shuts', () => {
    const dock = focus.slice(focus.indexOf('function DockComposer'));
    // The reply box draws the new thread card's menu since w-e1a42f6b21
    // (../renderer/src/components/ReplyModel.tsx); what it reports when the
    // drawer shuts, and what this box does with it, are unchanged.
    const wired = dock.match(/<ReplyModel[\s\S]*?\/>/);
    expect(wired, 'the reply box draws the drawer').toBeTruthy();
    expect(wired[0]).toContain('onOpenChange=');
    expect(dock).toContain('ref.current?.focus()');
  });

  // And it asks the same rule about the keys, so Escape means one thing in
  // both boxes.
  it('asks the one function in the reply box too', () => {
    const reply = fs.readFileSync(new URL('../renderer/src/components/ReplyModel.tsx', import.meta.url), 'utf8');
    expect(reply).toContain("import { modelDrawerKey } from '../model-drawer-keys';");
    expect(reply.match(/modelDrawerKey\(/g)?.length).toBe(2);
    expect(reply).toContain("from: 'inside'");
    expect(reply).toContain("from: 'word'");
  });
});
