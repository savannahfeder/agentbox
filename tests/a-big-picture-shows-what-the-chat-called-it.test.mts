// A picture opened big says what the chat called it, not only its file name.
//
// What broke: an agent showed two designs as "Before:" and "After:" with each
// picture's path under its label. Opened big, the view's bar read only
// "2-face-only.png", so to know whether it was the before or the after you had
// to close it and read the chat. Measured on the thread's own message: the bar
// had the name and nothing else.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { labelSaidFor } from '../shared/file-label.mts';

const said = (ts: number, text: string, source = 'agent') => ({ id: `l${ts}`, ts, source, patch: { result: text } });
const label = (text: string, path: string, source = 'agent') => labelSaidFor([said(1, text, source)], [path]);

describe('the words a message put beside a picture', () => {
  it('are the line above it, as in Before and After', () => {
    const text = 'Here is the change.\n\nBefore:\n/docs/designs/w-1/1-names.png\n\nAfter:\n/docs/designs/w-1/2-face-only.png';
    expect(label(text, 'designs/w-1/1-names.png')).toBe('Before');
    expect(label(text, 'designs/w-1/2-face-only.png')).toBe('After');
  });

  it('are the line above with a blank line between, and markdown taken off', () => {
    const text = '**Option 1: faces only**\n\n![](designs/a/1.png)\n\n**Option 2: names beside faces**\n\n![](designs/a/2.png)';
    expect(label(text, 'designs/a/1.png')).toBe('Option 1: faces only');
    expect(label(text, 'designs/a/2.png')).toBe('Option 2: names beside faces');
  });

  it('are the words on its own line, when the line says them', () => {
    expect(label('1. Faces only: designs/a/1.png', 'designs/a/1.png')).toBe('Faces only');
    expect(label('![The before](designs/a/1.png)', 'designs/a/1.png')).toBe('The before');
  });

  it('are the line under it when every picture in the message has its words under it', () => {
    const text = 'Two takes, stacked.\n\n/designs/a/1.png\nOption 1 keeps the names.\n\n/designs/a/2.png\nOption 2 drops them.';
    expect(label(text, 'designs/a/1.png')).toBe('Option 1 keeps the names.');
    expect(label(text, 'designs/a/2.png')).toBe('Option 2 drops them.');
  });

  it('find the picture whether the message names it by its whole path or the end of it', () => {
    expect(labelSaidFor([said(1, 'Before:\ndesigns/a/1.png')], ['/Users/x/docs/designs/a/1.png'])).toBe('Before');
  });

  it('are nothing when the picture stands alone or beside a long paragraph', () => {
    expect(label('![1.png](designs/a/1.png)', 'designs/a/1.png')).toBeNull();
    const prose = 'I went through every screen and moved the faces to the left of each row, so the list reads by who wrote it first and what it says second, which is what you asked for.';
    expect(label(`${prose}\n\n/designs/a/1.png`, 'designs/a/1.png')).toBeNull();
  });

  it('never take another picture, or its words, as this one\'s', () => {
    const text = 'Before:\n/designs/a/1.png\n/designs/a/2.png';
    expect(label(text, 'designs/a/2.png')).toBeNull();
    expect(label('Before:\n/designs/a/1.png', 'designs/a/9.png')).toBeNull();
  });

  it('ignore a file name used as a picture\'s alt words', () => {
    expect(label('Before:\n![2-face-only.png](designs/a/2-face-only.png)', 'designs/a/2-face-only.png')).toBe('Before');
  });

  it('come from the message that showed it, ahead of one that later only mentions it', () => {
    const lines = [said(1, 'After:\n/designs/a/2.png'), said(2, 'I updated designs/a/2.png as you asked.')];
    expect(labelSaidFor(lines, ['designs/a/2.png'])).toBe('After');
  });
});

describe('the big view', () => {
  it('shows those words in its bar beside the name', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/labelSaidFor\(/);
    expect(view).toMatch(/className="av-label"/);
  });
});
