// WALKING PAST A ROOM'S TAB DOES NOT READ IT, SO ITS MENTION STAYS IN NEEDS YOU.
//
// A message that names you sits at the top of Needs you until the room is read
// past it, and a room's chat read the room the instant it was drawn. Tab walks
// the state tabs and then the pinned rooms, so walking Needs you, In progress,
// Later, Done and Astral back round to Needs you read Astral on the way past,
// and the mention was gone when you got back. Measured in the built renderer
// with a fake inbox: a third of a second on the room's tab sent markRead.
// Now a room counts as read once it has stayed on screen, with the window in
// front, for READ_AFTER_MS.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { roomReader, READ_AFTER_MS } from '../renderer/src/team/rooms/room-chat-rules.ts';

const reader = ({ canRead = () => true } = {}) => {
  const read = vi.fn();
  return { read, r: roomReader({ read, canRead }) };
};

describe('a room is read once you stay on it', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is not read by a beat on its tab while Tab walks past', () => {
    const { read, r } = reader();
    r.open();
    vi.advanceTimersByTime(350);
    r.close();
    vi.advanceTimersByTime(10_000);
    expect(read).not.toHaveBeenCalled();
  });

  it('is read once it has been on screen for the whole wait, and not a millisecond before', () => {
    const { read, r } = reader();
    r.open();
    vi.advanceTimersByTime(READ_AFTER_MS - 1);
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('waits longer than a pause on a tab and less than reading a line', () => {
    expect(READ_AFTER_MS).toBeGreaterThanOrEqual(1000);
    expect(READ_AFTER_MS).toBeLessThanOrEqual(3000);
  });

  it('reads a message that arrives after you have stayed, at once', () => {
    const { read, r } = reader();
    r.open();
    vi.advanceTimersByTime(READ_AFTER_MS);
    r.arrived();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not read early for a message that arrives during the wait', () => {
    const { read, r } = reader();
    r.open();
    vi.advanceTimersByTime(500);
    r.arrived();
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(READ_AFTER_MS - 500);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('starts the wait over when the window goes behind and comes back', () => {
    const { read, r } = reader();
    r.open();
    vi.advanceTimersByTime(READ_AFTER_MS - 100);
    r.away();
    vi.advanceTimersByTime(5_000);
    expect(read).not.toHaveBeenCalled();
    r.open();
    vi.advanceTimersByTime(READ_AFTER_MS - 1);
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('is never read while it is held, as just after you marked it unread', () => {
    const { read, r } = reader({ canRead: () => false });
    r.open();
    vi.advanceTimersByTime(READ_AFTER_MS * 3);
    r.arrived();
    expect(read).not.toHaveBeenCalled();
  });
});

describe('the room chat reads through the reader', () => {
  const src = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');

  it('starts the reader instead of reading as it is drawn', () => {
    expect(src).toMatch(/roomReader\(/);
    expect(src).not.toMatch(/read\(\);\s*\n\s*window\.addEventListener\('focus', read\)/);
  });
});
