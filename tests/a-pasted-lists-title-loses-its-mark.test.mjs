// A PASTED LIST IS ONE THREAD, AND ITS TITLE LOSES THE DASH.
//
// Found by a tester on the Linux box, 2026-10-23 (F-26): paste a "- " list into
// the new thread card and send. The row was titled "- Fix the failing unittest
// in f_to_c (operator precedence bug)" with the dash still on it until an agent
// renamed it. A bullet is a mark about the shape of the text and never part of
// the name of anything, so `splitMessage` takes it off the title and leaves the
// message itself exactly as it was typed.
//
// AND THE CARD NO LONGER OFFERS TO SPLIT ONE (2026-10-26). F-86 reported that
// the "Send as 2 separate threads" link started both agents on the first click.
// Asked about the fix, the answer was that the whole idea was wrong: "I don't
// think sending to two separate threads should be programmatic. I think the
// agents can figure it out, especially since you might just say it or write
// it." So the offer, the send that made several rows at once, the toast that
// counted them and the undo that took them all back are gone. One send is one
// thread again, whatever the words look like. The second half of this file is
// the guard on that; git carries the removed version if the idea comes back in
// another shape.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitMessage } from '../renderer/src/message-split.ts';
import { threadMessage } from '../renderer/src/threads/composer-rules.ts';
import { sendingLine, sentLine } from '../renderer/src/compose-says.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const PASTED = '- Fix the failing unittest in f_to_c (operator precedence bug)\n- Add a --version flag to the CLI';

describe('the title a bulleted message gets', () => {
  it('loses the dash the person pasted', () => {
    expect(splitMessage(PASTED).title).toBe('Fix the failing unittest in f_to_c (operator precedence bug)');
  });

  it('keeps every line of the message itself, marks and all', () => {
    expect(splitMessage(PASTED).body).toBe(PASTED);
  });

  it('loses a star, a bullet and a number the same way', () => {
    expect(splitMessage('* Ship the pricing page').title).toBe('Ship the pricing page');
    expect(splitMessage('• Ship the pricing page').title).toBe('Ship the pricing page');
    expect(splitMessage('1. Ship the pricing page').title).toBe('Ship the pricing page');
    expect(splitMessage('2) Ship the pricing page').title).toBe('Ship the pricing page');
  });

  it('leaves a dash that is part of what was written', () => {
    expect(splitMessage('-5 degrees is what the test expects').title).toBe('-5 degrees is what the test expects');
    expect(splitMessage('--version is missing from the CLI').title).toBe('--version is missing from the CLI');
    expect(splitMessage('Fix f_to_c - the precedence is wrong').title).toBe('Fix f_to_c - the precedence is wrong');
  });

  it('is the same title the card sends', () => {
    expect(threadMessage(PASTED, []).title).toBe('Fix the failing unittest in f_to_c (operator precedence bug)');
  });
});

describe('what the card does with a list, which is nothing special', () => {
  const card = read('renderer/src/threads/ThreadComposer.tsx');
  const app = read('renderer/src/App.tsx');
  const split = read('renderer/src/message-split.ts');

  it('offers no way to send it as several threads', () => {
    expect(card).not.toMatch(/separate threads/);
    expect(card).not.toMatch(/asList/);
    expect(card).not.toMatch(/listedTasks/);
  });

  it('has no rule left for reading a message as a list of peers', () => {
    expect(split).not.toMatch(/listedTasks/);
  });

  it('sends one row from one Send, whatever was typed', () => {
    // A picked first-thread suggestion may carry its schedule (w-31c71743b5); still one row.
    expect(card).toMatch(/const send = \(\) => \(person \? sendMessage\(\) : sendTask\(ideaRule \? \{ repeat: ideaRule \} : \{\}\)\);/);
    expect(card.match(/await api\.compose\(/g)).toHaveLength(1);
  });

  it('says nothing about counting threads, in either half of the sentence', () => {
    expect(sendingLine({ kind: 'task', to: 'Kestrel' })).toBe('Starting in Kestrel…');
    expect(sentLine({ to: 'Kestrel' })).toBe('Started in Kestrel · Z to undo');
    // The old split wording is gone, so a stray count changes nothing.
    expect(sentLine({ to: 'Kestrel', threads: 3 })).toBe('Started in Kestrel · Z to undo');
  });

  it('takes one thread back with Z, because one send only ever made one', () => {
    expect(app).not.toMatch(/alsoMade/);
    expect(app).toMatch(/const one = \{ product: made\.product, id: made\.id \};/);
    expect(app).toMatch(/await api\.answer\(\{ product: one\.product, id: one\.id, status: 'done' \}\)/);
  });
});
