// The Instructions page showed the app's task brief as its raw template: a
// teammate read "<!-- store-tools:start -->", "{{name}}" and "the founder's
// agent inbox" under her own instructions. Measured on briefs/worker.md: 22
// marker lines, 4 {{name}} and 4 "the founder's", and the page rendered the
// file as it is on disk (components/InstructionSettings.tsx, `SharedPart`).
//
// The card stays shown (tests/the-system-prompt-shows-without-an-advanced-toggle),
// but it reads the brief the way an agent gets it: the name filled in, the
// half for tools this copy does not have left out, and no markers. Edit still
// opens the template itself, so the markers survive a save.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { briefAsRead } from '../renderer/src/brief-as-read.ts';
import { NAME, Name } from '../shared/product-name.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const worker = read('briefs/worker.md');
const defaults = JSON.parse(read('shared/instruction-defaults.json'));
const page = read('renderer/src/components/InstructionSettings.tsx');
const ipc = read('main/ipc.mjs');

describe('the brief on the Instructions page reads as an agent gets it', () => {
  for (const storeTools of [true, false]) {
    it(`has no markers, placeholders or "the founder's" (store tools ${storeTools ? 'on' : 'off'})`, () => {
      const shown = briefAsRead(worker, { storeTools });
      expect(shown).not.toMatch(/<!--|-->/);
      expect(shown).not.toMatch(/\{\{|\}\}/);
      expect(shown).not.toMatch(/the founder's/i);
      expect(shown).toContain(`worker session in ${NAME}`);
    });
  }

  it('keeps only the half for the tools this copy has', () => {
    const withTools = briefAsRead(worker, { storeTools: true });
    const without = briefAsRead(worker, { storeTools: false });
    expect(withTools).toContain('Claim your item first');
    expect(withTools).not.toContain('THIS INSTALL GIVES YOU NO TOOLS');
    expect(without).toContain('THIS INSTALL GIVES YOU NO TOOLS');
    expect(without).not.toContain('Claim your item first');
  });

  it('leaves a brief someone rewrote without markers as they wrote it', () => {
    expect(briefAsRead('Be brief.\n\nWork in {{Name}}.', { storeTools: false })).toBe(`Be brief.\n\nWork in ${Name}.`);
  });

  it('the shipped default is the same text as briefs/worker.md', () => {
    expect(defaults.system).toBe(worker);
  });

  it('the page reads the brief through it, and the main process says which tools a worker has', () => {
    expect(page).toMatch(/asRead:\s*briefAsRead/);
    expect(page).not.toMatch(/Keep the template placeholders/);
    expect(ipc).toMatch(/storeTools: !!supervisor\.storeMcpCommand\?\.\(\)/);
  });
});
