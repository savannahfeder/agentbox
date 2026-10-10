// THE PALETTE OPENS ON CONTROL-K.
//
// Command-K is the Mac chord. The same handler treats Control as that key,
// which is what a Linux keyboard has. A page inside the pane sends the chord
// up through whatTheFileSentUp, and the window handler in App.tsx reads
// metaKey or ctrlKey before it opens the palette.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { whatTheFileSentUp } from '../shared/artifact-keys.mjs';

const app = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../renderer/src/App.tsx'),
  'utf8',
);

describe('the palette opens without the command key', () => {
  it('treats control-k as the palette when no command key is down', () => {
    expect(whatTheFileSentUp({ key: 'k', ctrl: true, meta: false })).toBe('palette');
    expect(whatTheFileSentUp({ key: 'K', ctrl: true, meta: false })).toBe('palette');
    expect(whatTheFileSentUp({ key: 'k', ctrl: false, meta: false })).not.toBe('palette');
  });

  it('the window handler opens the palette on ctrl as well as meta', () => {
    const start = app.indexOf('const onKey = (e: KeyboardEvent) => {');
    const end = app.indexOf('if (focused) {', start);
    const handler = app.slice(start, end);
    expect(handler).toContain("(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'");
    expect(handler).toContain("setModal((m) => (m === 'palette' ? null : 'palette'))");
  });
});
