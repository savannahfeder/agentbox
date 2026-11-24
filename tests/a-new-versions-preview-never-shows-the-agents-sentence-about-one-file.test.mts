// A NEW VERSION'S PREVIEW SHOWED THE AGENT'S SENTENCE ABOUT ITS ONE FILE.
//
// Power testers on a team (2026-11-23), after cf0fc02f6 took out a sentence
// that names two files. Two lines that name one file still reached the bar:
// "The attached file is `bookings-empty-states-v2.html`. I made no repository
// changes." read "The attached file is . I made no repository changes.", and
// "Agentbox linked the new version to the original on this thread.
// [booking-flow-v2.html](...)" put that whole sentence beside the name.
// Measured on their ledgers: w-c6db4aaa86 and w-90ee588b21, each one result line.
import { describe, it, expect } from 'vitest';
import { labelSaidFor } from '../shared/file-label.mts';

const said = (text: string) => [{ id: 'l1', ts: 1, source: 'agent', patch: { result: text } }];
const label = (text: string, path: string) => labelSaidFor(said(text), [path]);

describe('a line that names one file', () => {
  it('is no label when the name was cut out of the middle of a sentence', () => {
    expect(label('The attached file is `bookings-empty-states-v2.html`. I made no repository changes.', 'designs/w-c/bookings-empty-states-v2.html')).toBeNull();
    expect(label('I saved designs/a/1.png for you', 'designs/a/1.png')).toBeNull();
  });

  it('is no label when its words are a whole sentence before the name', () => {
    const text = '**Saved.**\n\nAgentbox linked the new version to the original on this thread. [booking-flow-v2.html](/store/web-app/designs/w-9/booking-flow-v2.html)';
    expect(label(text, 'designs/w-9/booking-flow-v2.html')).toBeNull();
  });

  it('still labels it by the words before or after the name', () => {
    expect(label('1. Faces only: designs/a/1.png', 'designs/a/1.png')).toBe('Faces only');
    expect(label('Option 2: faces only designs/a/2.png', 'designs/a/2.png')).toBe('Option 2: faces only');
    expect(label('designs/a/3.png Option 3', 'designs/a/3.png')).toBe('Option 3');
    expect(label('![The before](designs/a/1.png)', 'designs/a/1.png')).toBe('The before');
  });

  it('still takes a sentence on the line beside a picture that stands alone', () => {
    expect(label('/designs/a/1.png\nOption 1 keeps the names.', 'designs/a/1.png')).toBe('Option 1 keeps the names.');
  });
});
