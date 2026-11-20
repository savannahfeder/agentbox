// A TASK HANDED TO YOU OPENS AS ANY THREAD DOES (2026-11-20).
//
// Sam opened "Overlapping appointments fix", which Theo had handed over. Above
// the conversation stood "Task · Theo gave you this · High" and "Handed on from
// Theo's thread", the top bar carried both faces as well as Close task and
// Done, and the page ran wider than any other thread. It now sits in the same
// reading column, says only where it came from above its name, and who gave it
// is the first message, signed. Measured by reading the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');

describe('a task handed to you', () => {
  it('says where it came from, and no second line saying who gave it and how urgent', () => {
    expect(focus).toContain('{givenTask && <HandedFrom item={item} />}');
    expect(focus).not.toContain('<TeamSaid item={item} />');
  });
  it('keeps the faces out of its top bar', () => {
    expect(focus).toContain('{crumbFrom && !inChats && !givenTask && (direct || summarised) && <ConversationAside item={item} />}');
  });
});
