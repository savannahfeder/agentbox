// THE DONE TAB OPENS ON THE WEB APP.
//
// What broke (2026-10-26, the web app driven at iPhone size against a stand-in
// cloud): tapping Done threw "Cannot read properties of null (reading 'items')"
// inside React's render and the page stopped answering taps. Done asks for the
// next page of older threads (api.olderItems), and the web app's bridge
// answered every read it has no computer for with null, which App.tsx spreads
// as `y.items`. The command menu (a list of names) and a code file (an `ok`
// answer) were read the same way. Each now gets the empty answer of its own
// shape (EMPTY_READS in renderer/src/cloud-bridge.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { EMPTY_READS } from '../renderer/src/cloud-bridge';

describe('what the web app answers for what only the computer has', () => {
  it('older threads: none, and no more to come', async () => {
    expect(await EMPTY_READS.olderItems()).toEqual({ items: [], more: false });
  });
  it('the command menu: no names', async () => {
    expect(await EMPTY_READS.commandCatalog()).toEqual([]);
  });
  it('a code file, a note or an outside agent\'s conversation: not here, said in words', async () => {
    expect(await EMPTY_READS.codeFile()).toMatchObject({ ok: false, error: expect.stringMatching(/computer/) });
    expect(await EMPTY_READS.railNote()).toMatchObject({ ok: false, error: expect.stringMatching(/computer/) });
    expect(await EMPTY_READS.agentConversation()).toMatchObject({ ok: false, reason: expect.stringMatching(/computer/) });
  });
  it('Settings: read, with no computer pages', async () => {
    expect(await EMPTY_READS.settingsRead()).toEqual({ ok: true, workspace: null, projects: [] });
  });
  it('is laid over the doors that answer null', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    const nulls = src.indexOf('READS.has(name) ? async () => null');
    const laid = src.indexOf('Object.assign(bridge, EMPTY_READS');
    expect(nulls).toBeGreaterThan(0);
    expect(laid).toBeGreaterThan(nulls);
  });
});
