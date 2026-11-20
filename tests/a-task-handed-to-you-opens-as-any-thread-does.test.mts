// A TASK HANDED TO YOU OPENS AS ANY THREAD DOES (2026-11-20).
//
// Sam opened "Overlapping appointments fix", which Theo had handed over. Above
// the conversation stood "Task · Theo gave you this · High" and "Handed on from
// Theo's thread", and the top bar carried both faces as well as Close task and
// Done: a header unlike any other thread's. It now opens with the thread's
// name, as every page does, then the way back to where it came from; who gave
// it is the first message, signed. Measured by reading the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

describe('a task handed to you', () => {
  it('opens with its name, then where it came from', () => {
    expect(focus).toContain('{givenTask && <h2 className="one-title given-title">{threadName}</h2>}');
    expect(focus.indexOf('<h2 className="one-title given-title">')).toBeLessThan(focus.indexOf('{givenTask && <HandedFrom item={item} />}'));
  });
  it('has no second line saying who gave it and how urgent', () => {
    expect(focus).not.toContain('<TeamSaid item={item} />');
  });
  it('keeps the faces out of its top bar', () => {
    expect(focus).toContain('{crumbFrom && !inChats && !givenTask && (direct || summarised) && <ConversationAside item={item} />}');
  });
});
