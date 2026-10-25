// THE TOAST SITS IN THE BAR ON A THREAD PAGE (w-65bcefb857).
//
// Once every thread with an agent opened on the one-at-a-time page, picking an
// option on an In progress thread raised the corner card ("Option 1 sent →
// Sandbox · Z Undo") across the right end of the reply box, over the model it
// sends to. Photographed on a working copy of the app. The founder had asked
// that a toast "not block anything important... maybe in space that's never or
// rarely used", and the sent line already sits in the bar's empty middle. Now
// the card does too, on one line, whenever a thread's page is open. Off a
// thread page it keeps its corner.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/one-thing-at-a-time.css');
const styles = read('renderer/src/styles.css');

describe('on a thread\'s page', () => {
  it('the card goes up into the bar', () => {
    expect(app).toMatch(/const toastInBar = !!cornerHeaderTarget && \(!!queueSpot \|\| onePage\) && !onPhone\(\);/);
    expect(app).toMatch(/return toastInBar && cornerHeaderTarget \? createPortal\(card, cornerHeaderTarget\) : card;/);
  });
  it('drawn on one line, first in the corner, out of the window\'s corner', () => {
    // Relative, not static: its countdown line is drawn against it.
    expect(css).toMatch(/\.toast\.toast-in-bar \{[^}]*position: relative; inset: auto; order: -1;/);
    expect(css).toMatch(/\.toast\.toast-in-bar \{[^}]*grid-template-areas: "title line keys";/);
  });
});

describe('anywhere else', () => {
  it('the card keeps its corner', () => {
    expect(app).toMatch(/className=\{`toast toast-goes\$\{about \? '' : ' toast-plain'\}\$\{toastInBar \? ' toast-in-bar' : ''\}`\}/);
    expect(styles).toMatch(/\.toast \{\n  position: fixed;\n  bottom: 30px;\n  right: 30px;/);
  });
});
