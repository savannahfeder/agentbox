// AN AGENT'S NEW VERSION GOES BACK TO WHOEVER ASKED, AND ANSWERS THE COMMENTS IT CARRIED.
//
// What broke, 2026-11-21, four testers on one team: a review handed to an agent
// came back as sign-up-screens-v2.md in the agent's own thread and nowhere else.
// The person who asked never got it, and the comments it answered stayed open
// on their copy. "Continue it yourself opens a Private task with no return-to-Sam
// cue." Measured by reading what the agent thread offered: nothing named the
// person the work came from.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileToSendBack, whereItGoesBack, sendBackWords } from '../renderer/src/threads/send-back';

const ME = 'jamie';
const PRIYA = 'priya';
const line = (ts: number, patch: Record<string, unknown>, source = 'founder') => ({ id: 'w-a1', ts, source, patch });
// How a saved attachment is named: the time in base 36, a few random letters, the name.
const STAMP = Date.now().toString(36);
const handed = [
  line(1, { title: 'Approve the words on the sign-up screens', body: `Priya asked:\n\nSay yes or change them.\n\n[sign-up-screens.md](attachments/${STAMP}-x7k2-sign-up-screens.md)` }),
  line(2, { result: 'Saved the changes as [sign-up-screens-v2.md](attachments/sign-up-screens-v2.md).' }, 'agent'),
];

describe('the file that goes back', () => {
  it("is the agent's newest version of a file the thread started with", () => {
    expect(fileToSendBack(handed)).toMatchObject({ name: 'sign-up-screens-v2.md', path: 'attachments/sign-up-screens-v2.md' });
  });

  it('is the newest when the agent made several', () => {
    const more = [...handed, line(3, { answer: 'Shorter please.' }), line(4, { result: 'Done: [sign-up-screens-v3.md](attachments/sign-up-screens-v3.md)' }, 'agent')];
    expect(fileToSendBack(more)?.name).toBe('sign-up-screens-v3.md');
  });

  it('is nothing before the agent has made one', () => {
    expect(fileToSendBack(handed.slice(0, 1))).toBe(null);
  });

  // Rerun: Lena's agent saved its answer as clinic-checkout-review.html, so the
  // thread offered her no way to send it back to Sam.
  it("is the agent's newest file of its own when it made no version of one it was handed", () => {
    const own = [handed[0], line(2, { result: 'Wrote [sign-up-review.md](attachments/sign-up-review.md).' }, 'agent')];
    expect(fileToSendBack(own)?.name).toBe('sign-up-review.md');
  });

  it('prefers a version of the handed file to a file of its own', () => {
    const both = [...handed, line(3, { result: 'Also [notes.md](attachments/notes.md).' }, 'agent')];
    expect(fileToSendBack(both)?.name).toBe('sign-up-screens-v2.md');
  });
});

describe('who it goes back to', () => {
  const task = { product: 'ferry', id: 'w-t1', labels: ['given-task'], assignee: ME, createdBy: PRIYA, people: [PRIYA, ME], status: 'open' };
  it('the teammate who gave you the task it was handed from', () => {
    const agentThread = { product: 'ferry', id: 'w-a1', labels: ['handed-from:ferry:w-t1'] };
    expect(whereItGoesBack(agentThread, [task], ME)).toMatchObject({ to: PRIYA, task: { id: 'w-t1' } });
  });

  // Rerun, 2026-11-21: Theo handed Sam's message in their conversation to his
  // agent, and its new version had no way back to Sam.
  it('the other person in the conversation a message was handed from', () => {
    const chat = { product: 'direct-ab', id: 'w-c1', labels: [], createdBy: 'sam', people: [ME, 'sam'], status: 'open' };
    expect(whereItGoesBack({ product: 'ferry', id: 'w-a4', labels: ['handed-from:direct-ab:w-c1'] }, [chat], ME)).toMatchObject({ to: 'sam', task: { id: 'w-c1' } });
  });

  it('the owner of the teammate thread it carries on', () => {
    expect(whereItGoesBack({ product: 'ferry', id: 'w-a2', labels: ['continued-from:sam:w-s1'] }, [], ME)).toEqual({ to: 'sam', thread: { personId: 'sam', threadId: 'w-s1' } });
  });

  it('nobody, for a thread that came from no one, or from a task of your own', () => {
    expect(whereItGoesBack({ product: 'ferry', id: 'w-a3', labels: [] }, [task], ME)).toBe(null);
    const mine = { ...task, createdBy: ME, people: [ME], assignee: ME };
    expect(whereItGoesBack({ product: 'ferry', id: 'w-a1', labels: ['handed-from:ferry:w-t1'] }, [mine], ME)).toBe(null);
  });
});

describe('what they are told', () => {
  // In the running app the name drew three times: in the words, as the link, as the tile.
  it('says what it answers without naming the file it carries', () => {
    expect(sendBackWords(3)).toBe('Made the changes from the 3 comments.');
    expect(sendBackWords(1)).toBe('Made the change from the comment.');
    expect(sendBackWords(0)).toBe('Here is the new version.');
  });
});

describe('the agent thread offers it, and the hand-over remembers which comments went', () => {
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  it('the card keeps the ticked comments under the new thread', () => {
    expect(card).toMatch(/rememberHanded\(/);
  });
  it('the dock offers Send it back', () => {
    expect(focus).toContain('<SendBack ');
  });
});
