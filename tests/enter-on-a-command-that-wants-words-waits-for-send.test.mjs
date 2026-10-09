// PICKING A COMMAND PUTS IT IN THE BOX AND WAITS FOR SEND. EVERY COMMAND.
//
// The bug: typing /loop and pressing Return started a loop straight away, with
// nothing to loop on. Nobody ever wants a bare /loop; the description of what
// to repeat is the whole command. Measured by reading `pickRow` in Focus.tsx:
// every command row except Tab went to `send()`, so Enter on /loop, /fork or
// any of the session's own skills ran it with no words at all.
//
// A first fix sorted commands into ones that want words and ones that do not,
// and was sent back as "we need a generalist solution for all commands". The
// session's own commands arrive as bare names, so which of them want words
// cannot be read; any list is a guess. So the rule is the terminal's, for every
// command: picking it puts it in the box, Send runs it. The box says faintly
// what the command takes and that ⌘↵ runs it, because a menu that closes on a
// pick and leaves only `/usage ` behind is the "Enter did nothing" complaint
// w-5d1ad29efa was about.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slashRows, enterWaitsForWords, commandBeingWritten, holdingHint } from '../renderer/src/slash-menu.ts';
import { providerCommands } from '../shared/provider-commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const row = (query, name, native = []) => slashRows(query, false, true, native).find((r) => r.kind === 'command' && r.cmd.name === name);

describe('picking a command row', () => {
  it('waits on a command the session brought, like /loop', () => {
    expect(enterWaitsForWords(row('loop', 'loop', ['loop']))).toBe(true);
    expect(enterWaitsForWords(row('simp', 'simplify', ['simplify']))).toBe(true);
  });

  it('waits on every one of our commands too, on both engines', () => {
    for (const cmd of providerCommands('claude-code')) {
      expect(enterWaitsForWords({ kind: 'command', cmd }), cmd.name).toBe(true);
    }
    const codex = slashRows('', false, false).filter((r) => r.kind === 'command');
    expect(codex.length).toBeGreaterThan(0);
    for (const r of codex) expect(enterWaitsForWords(r), r.cmd.name).toBe(true);
  });

  it('never waits on a permission mode, which is a setting and not a message', () => {
    const modes = slashRows('', false, true).filter((r) => r.kind === 'mode');
    expect(modes.length).toBeGreaterThan(0);
    for (const m of modes) expect(enterWaitsForWords(m)).toBe(false);
    const codexModes = slashRows('', false, false).filter((r) => r.kind === 'codexMode');
    for (const m of codexModes) expect(enterWaitsForWords(m)).toBe(false);
  });

  it('has no path left from the menu to send', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    const pick = focus.slice(focus.indexOf('const pickRow = '), focus.indexOf('// TYPING IT STRAIGHT THROUGH.'));
    expect(pick).toContain('if (enterWaitsForWords(row)) { setText(commandDraft(row.cmd)); ref.current?.focus(); }');
    expect(pick).not.toContain('send(');
    // Enter and Tab are the same pick; ⌘↵ is left to fall through to Send.
    expect(focus).toContain('pickRow(menuRows[slashAt] ?? menuRows[0]);');
    expect(focus).toContain("(e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab'");
  });
});

describe('the command the box is holding', () => {
  it('is named once she has typed past the word', () => {
    expect(commandBeingWritten('/loop ', true, ['loop'])?.name).toBe('loop');
    expect(commandBeingWritten('/loop check the deploy every 5m', true, ['loop'])?.name).toBe('loop');
    expect(commandBeingWritten('/fork try the other layout', true, [])?.name).toBe('fork');
    expect(commandBeingWritten('/usage ', true, [])?.name).toBe('usage');
    expect(commandBeingWritten('/rc ', true, [])?.name).toBe('remote-control');
  });

  it('is nothing while the word is still being typed, which is the menu\'s job', () => {
    expect(commandBeingWritten('/loop', true, ['loop'])).toBe(null);
    expect(commandBeingWritten('/', true, ['loop'])).toBe(null);
  });

  it('is nothing for a word that is not a command, or not at the start', () => {
    expect(commandBeingWritten('/looping around', true, ['loop'])).toBe(null);
    expect(commandBeingWritten('please /loop this', true, ['loop'])).toBe(null);
    expect(commandBeingWritten('plain words', true, ['loop'])).toBe(null);
  });

  it('is nothing for a Claude command on a Codex row', () => {
    expect(commandBeingWritten('/loop check it', false, ['loop'])).toBe(null);
  });
});

describe('what the box says faintly after the command', () => {
  const cmd = (name, native = []) => commandBeingWritten(`/${name} `, true, native);

  it('asks what a session command should do, since its words cannot be read', () => {
    expect(holdingHint(cmd('loop', ['loop']))).toBe('what it should do, then ⌘↵');
  });

  it('says what one of ours takes, without the brackets', () => {
    expect(holdingHint(cmd('fork'))).toBe('what to try instead, then ⌘↵');
    expect(holdingHint(cmd('model'))).toBe('model, then ⌘↵');
  });

  it('says only that Send runs a command that takes nothing', () => {
    expect(holdingHint(cmd('usage'))).toBe('⌘↵ to run');
    expect(holdingHint(cmd('context'))).toBe('⌘↵ to run');
  });
});
