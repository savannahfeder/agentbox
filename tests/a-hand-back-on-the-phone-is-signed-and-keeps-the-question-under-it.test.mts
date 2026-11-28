// A person you asked to review or help hands the thread back as one message
// under their name, with what you had asked under it in grey (desktop,
// 2026-11-23). The phone parity round of 2026-11-25 found the phone signing
// that message "The agent" and dropping the question under it, so on the
// phone a teammate's verdict read as the agent's.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');

describe('a hand-back on the phone', () => {
  it('is signed by who handed it back, as the desktop signs it, before the thread agent name', () => {
    expect(src).toContain("{yours ? 'You' : e.from ?? name ?? 'The agent'}");
  });

  it('draws what you had asked under it, in the dim ink the desktop uses', () => {
    expect(src).toMatch(/<Markdown text=\{e\.text \?\? ''\} dir=\{dir\} files=\{files\} \/>\s*\{!!e\.asked && <T [^>]*color: color\.dim[^>]*>\{e\.asked\}<\/T>\}/);
    expect(fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8')).toContain('.msg-asked { color: var(--text-dim); }');
  });
});
