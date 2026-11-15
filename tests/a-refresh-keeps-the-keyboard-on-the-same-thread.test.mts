// A REFRESH KEEPS THE KEYBOARD ON THE SAME THREAD, SO THE BOARD STAYS WHERE
// YOU SCROLLED IT.
//
// Reported 2026-10-05: "every time i scroll up then open this modal it
// scrolls down again." The new-message box was not the cause. The keyboard's
// place was a NUMBER, the twenty-first card in the board's reading order, and
// the board scrolls its selected card into view whenever that card changes.
// That evening dozens of agents were finishing threads, so cards kept leaving
// the columns above the selected one; place 21 then named a different card
// every few seconds, and the board scrolled down to each in turn. Measured on
// the real renderer, headless, with 40 cards: scrolled to the top, three
// threads above the selected one finish, nothing pressed, and the board went
// from 0 to 1,091 pixels down, landing on "Thread number 24" instead of 21.
//
// So the place follows the thread: when the list changes under a cursor nobody
// moved, it goes to wherever that thread is now.
import { describe, it, expect } from 'vitest';
import { cursorIndex, cursorMark } from '../renderer/src/cursor-follows.ts';

const row = (id, product = 'p') => ({ id, product });
const rows = (...ids) => ids.map((id) => row(id));

describe('the keyboard place when the list changes', () => {
  it('follows its thread up when threads above it leave (the reported case)', () => {
    const before = rows('a', 'b', 'c', 'd', 'e');
    const last = cursorMark(before, 3); // on d
    const after = rows('b', 'c', 'd', 'e');
    expect(cursorIndex({ list: after, selected: 3, last })).toBe(2);
    expect(after[cursorIndex({ list: after, selected: 3, last })].id).toBe('d');
  });

  it('follows its thread down when threads arrive above it', () => {
    const last = cursorMark(rows('a', 'b', 'c'), 1); // on b
    expect(cursorIndex({ list: rows('x', 'y', 'a', 'b', 'c'), selected: 1, last })).toBe(3);
  });

  it('follows its thread into another column of the board', () => {
    // Reading order is down one column then the next, so a card an agent
    // picks up jumps from the first column to the second.
    const last = cursorMark(rows('w1', 'w2', 'w3', 'r1'), 1); // on w2
    expect(cursorIndex({ list: rows('w1', 'w3', 'r1', 'w2'), selected: 1, last })).toBe(3);
  });

  it('stays put when nothing moved', () => {
    const list = rows('a', 'b', 'c');
    expect(cursorIndex({ list, selected: 2, last: cursorMark(list, 2) })).toBe(2);
  });

  it('does NOT override a move you made: J, K or a click win', () => {
    const before = rows('a', 'b', 'c', 'd');
    const last = cursorMark(before, 1); // was on b
    // You pressed J (selected went 1 -> 2) and the list also changed.
    expect(cursorIndex({ list: rows('a', 'b', 'c', 'd', 'e'), selected: 2, last })).toBe(2);
  });

  it('keeps the same place when its own thread is gone, clamped to the end', () => {
    const last = cursorMark(rows('a', 'b', 'c'), 1); // on b
    expect(cursorIndex({ list: rows('a', 'c'), selected: 1, last })).toBe(1);
    const lastAtEnd = cursorMark(rows('a', 'b', 'c'), 2); // on c
    expect(cursorIndex({ list: rows('a', 'b'), selected: 2, last: lastAtEnd })).toBe(1);
  });

  it('is 0 on an empty list and on the first look', () => {
    expect(cursorIndex({ list: [], selected: 4, last: cursorMark(rows('a'), 0) })).toBe(0);
    expect(cursorIndex({ list: rows('a', 'b'), selected: 1, last: null })).toBe(1);
    expect(cursorIndex({ list: rows('a', 'b'), selected: 9, last: null })).toBe(1);
  });

  it('does not mistake the same id in another project for its thread', () => {
    const last = cursorMark([row('w-1', 'one'), row('w-2', 'one')], 1); // on one:w-2
    const after = [row('w-2', 'two'), row('w-1', 'one'), row('w-9', 'one')];
    expect(cursorIndex({ list: after, selected: 1, last })).toBe(1);
  });

  it('marks nothing on an empty list', () => {
    expect(cursorMark([], 0)).toBeNull();
  });
});
