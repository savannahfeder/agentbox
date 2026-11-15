// "Hand to an agent" on Sofia's 8:12pm reply in a task quoted the wrong message:
// the new-thread box opened prefilled "Dev asked: Sofia:
// review the seat picker demo page once my agent restyles it...", the task's
// first message, not her two asks, and the thread came out titled "Dev asked:".
// Measured in App.tsx: on a task row `handToAgent` built the box from the task's
// brief and never looked at the message pressed; conversations had been fixed,
// tasks had not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { taskHandOff } from '../renderer/src/threads/composer-rules';

const brief = { body: 'Sofia: review the seat picker demo page once my agent restyles it.', files: [{ name: 'seat.png', srcPath: '/t/seat.png' }] };
const nameOf = (id) => ({ sofia: 'Sofia', dev: 'Dev' })[id] ?? null;

describe('handing a task\'s message to an agent', () => {
  it('quotes the message pressed, signed by who wrote it, with the task\'s files', () => {
    const s = taskHandOff({ from: 'Dev', brief, message: { uid: 'm3', text: 'Two asks: does it work at phone width, and what shows if someone types 21?', by: 'sofia' }, nameOf });
    expect(s.body).toBe('Sofia wrote: Two asks: does it work at phone width, and what shows if someone types 21?\n\n');
    expect(s.body.split('\n')[0]).not.toMatch(/asked:$/);
    expect(s.attachments).toEqual([{ name: 'seat.png', srcPath: '/t/seat.png', image: true }]);
  });

  it('pressed on the task\'s own first message, it is the task as before', () => {
    const s = taskHandOff({ from: 'Dev', brief, message: { uid: 'm1', text: brief.body, by: 'dev' }, nameOf });
    expect(s.body).toBe(`Dev asked:\n\n${brief.body}\n\n`);
  });

  it('with no message pressed, it is the task as before', () => {
    expect(taskHandOff({ from: null, brief, message: null, nameOf }).body).toBe(`${brief.body}\n\n`);
  });
});

it('the app hands it the message pressed on a task', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/taskHandOff\(\{ from, brief: b, message: message \?\? null, nameOf/);
});
