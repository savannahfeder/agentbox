// A TEAMMATE IS PAUSED FROM THE PHONE'S COMMAND LIST.
//
// The desktop's ⌘K has "Pause <name>" and "Resume <name>" for each AI teammate
// (Palette.tsx `teammate-pause-`). The phone could pause one only from its
// chat page; typing "pause" in the phone's command list found nothing. The
// parity ledger (mobile/parity.mjs) listed it as still to do.
import { describe, it, expect } from 'vitest';
import { commandsFor, phoneCommands } from '../mobile/src/lib/palette';

const mates = [{ id: 'm-1', name: 'Quality lead', paused: false }, { id: 'm-2', name: 'Chief of staff', paused: true }];

describe('pausing a teammate from the command list', () => {
  it('offers Pause for a teammate at work and Resume for a paused one, in the desktop\'s words', () => {
    const rows = phoneCommands({ team: true, mates }).filter((c) => c.id.startsWith('teammate-pause-'));
    expect(rows.map((r) => [r.label, r.act])).toEqual([
      ['Pause Quality lead', { teammate: 'm-1', paused: true }],
      ['Resume Chief of staff', { teammate: 'm-2', paused: false }],
    ]);
  });

  it('is found by typing pause or resume', () => {
    const all = phoneCommands({ team: true, mates });
    expect(commandsFor('pause quality', all).map((c) => c.label)).toEqual(['Pause Quality lead']);
    expect(commandsFor('resume chief', all).map((c) => c.label)).toEqual(['Resume Chief of staff']);
  });

  // With four teammates the list opened on four Pause rows before anything was typed.
  it('waits to be typed for, as Rank and the cloud rows do, so the list opens short', () => {
    const all = phoneCommands({ team: true, mates, computer: { paused: false, projects: [{ slug: 'a', name: 'Alpha' }], order: [], cloud: { mode: 'mac' } } });
    const opened = commandsFor('', all).map((c) => c.id);
    expect(opened.some((id) => id.startsWith('teammate-pause-') || id.startsWith('rank-') || id.startsWith('cloud-'))).toBe(false);
    expect(opened).toEqual(expect.arrayContaining(['new', 'inbox', 'mate-m-1', 'pause']));
    expect(commandsFor('rank', all).map((c) => c.id)).toEqual(['rank-a']);
  });

  it('is not offered with no teammates', () => {
    expect(phoneCommands({ team: true }).some((c) => c.id.startsWith('teammate-pause-'))).toBe(false);
  });
});
