// A CODEX COMMAND WAITS FOR MEMORY TOO — w-e5225b62ba.
//
// w-3958c3753d shipped the memory check for Claude Code workers only, and said
// so: "Codex workers are not covered yet." A Codex worker running the test suite
// costs the same gigabyte a Claude one does, so half the fleet was walking past
// the gate.
//
// WHAT WAS MEASURED, on this Mac, codex-cli 0.160.0, a real `codex app-server`
// and real turns (2026-10-04). None of this is read from documentation.
//
//   The hook payload is Claude Code's, field for field. `tool_name` is "Bash",
//   the command is at `tool_input.command`, and the deny Codex reads is the same
//   `hookSpecificOutput.permissionDecision` JSON main/memory-gate-server.mjs
//   already prints. So scripts/memory-gate-hook.sh is carried over UNCHANGED.
//
//   THE MATCHER IS "Bash" AND NOT "shell". A hook with matcher "shell" was
//   listed as trusted and enabled and never fired once; the same hook with no
//   matcher fired and reported `tool_name: "Bash"`.
//
//   A hook that slept 8 s made the command WAIT and then run (turn succeeded,
//   22 s). A hook that denied blocked it, and our sentence reached the model
//   verbatim: "Command blocked by PreToolUse hook: <reason>".
//
//   `session_id` IN THE PAYLOAD IS THE APP-SERVER'S OWN `thread.id`. Started a
//   thread (01a10a23-820b-7933-bd6e-8d4ef238f50d), ran a turn, and the hook was
//   handed that same string. This is the whole reason the Codex side works at
//   all: ONE app-server serves every Codex thread, so its environment cannot
//   name an item the way a Claude worker's can. The thread names itself instead.
//
//   TRUST IS PER HOOK, and that is what lets us leave everyone else's alone.
//   `config/batchWrite` of `hooks.state."<key>".trusted_hash` turned ours
//   trusted and left a second hook in the same file untrusted, preserving an
//   unrelated `[projects."..."]` table in config.toml. Editing our own command
//   afterwards turned ours "modified", not trusted, so a tampered hook does not
//   inherit the trust we wrote.

import { describe, it, expect } from 'vitest';
import {
  CODEX_MATCHER,
  ourHookGroups,
  withOurHooks,
  withoutOurHooks,
  ourTrustEdits,
  hookIsOurs,
} from '../main/codex-memory-gate.mjs';

const SCRIPT = '/Applications/Agentbox.app/Contents/scripts/memory-gate-hook.sh';

describe('the hook we ask Codex to run', () => {
  it('matches Bash, which is what Codex calls the tool that runs commands', () => {
    // Measured: matcher "shell" never fired; the payload says tool_name "Bash".
    expect(CODEX_MATCHER).toBe('Bash');
    const groups = ourHookGroups(SCRIPT);
    expect(groups.PreToolUse[0].matcher).toBe('Bash');
    expect(groups.PostToolUse[0].matcher).toBe('Bash');
  });

  it('runs the same script the Claude side runs, with the same two modes', () => {
    const groups = ourHookGroups(SCRIPT);
    expect(groups.PreToolUse[0].hooks[0].command).toBe(`'${SCRIPT}' pre`);
    expect(groups.PostToolUse[0].hooks[0].command).toBe(`'${SCRIPT}' post`);
    expect(groups.PreToolUse[0].hooks[0].type).toBe('command');
  });

  it('gives the pre hook longer than the longest wait, and the post hook seconds', () => {
    // A hook that times out lets its command run, so the app's own refusal has
    // to arrive first. Same reasoning as memoryGateHooks() on the Claude side.
    const groups = ourHookGroups(SCRIPT);
    expect(groups.PreToolUse[0].hooks[0].timeout).toBeGreaterThan(20 * 60);
    expect(groups.PostToolUse[0].hooks[0].timeout).toBeLessThanOrEqual(30);
  });

  it('quotes a path with a space in it, because an app bundle has one', () => {
    const odd = "/Users/x/My Apps/Agent's Box.app/scripts/memory-gate-hook.sh";
    const cmd = ourHookGroups(odd).PreToolUse[0].hooks[0].command;
    expect(cmd).toBe(`'/Users/x/My Apps/Agent'\\''s Box.app/scripts/memory-gate-hook.sh' pre`);
  });
});

describe('putting it in a hooks.json that is not ours to own', () => {
  it('leaves every other hook exactly where it was', () => {
    const theirs = {
      description: 'my hooks',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/home/me/lint.sh' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: '/home/me/hello.sh' }] }],
      },
    };
    const after = withOurHooks(theirs, SCRIPT);
    expect(after.description).toBe('my hooks');
    expect(after.hooks.SessionStart).toEqual(theirs.hooks.SessionStart);
    expect(after.hooks.PreToolUse[0]).toEqual(theirs.hooks.PreToolUse[0]);
    expect(after.hooks.PreToolUse).toHaveLength(2);
    expect(after.hooks.PreToolUse[1].hooks[0].command).toContain('memory-gate-hook.sh');
  });

  it('writes a whole file when there was none', () => {
    const after = withOurHooks(null, SCRIPT);
    expect(Object.keys(after.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse']);
    expect(after.hooks.PreToolUse).toHaveLength(1);
  });

  it('is the same file twice over, so turning the switch on again adds nothing', () => {
    const once = withOurHooks(null, SCRIPT);
    const twice = withOurHooks(once, SCRIPT);
    expect(twice).toEqual(once);
    expect(twice.hooks.PreToolUse).toHaveLength(1);
  });

  it('replaces our own older entry rather than keeping both', () => {
    // The app moved, so the script path changed. The stale one must go, or a
    // worker asks a socket through a script that is no longer there.
    const old = withOurHooks(null, '/old/path/scripts/memory-gate-hook.sh');
    const now = withOurHooks(old, SCRIPT);
    const commands = now.hooks.PreToolUse.map((g) => g.hooks[0].command);
    expect(commands).toEqual([`'${SCRIPT}' pre`]);
  });

  it('takes ours out again and leaves theirs, when the switch goes off', () => {
    const theirs = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/home/me/lint.sh' }] }] } };
    const on = withOurHooks(theirs, SCRIPT);
    const off = withoutOurHooks(on);
    expect(off.hooks.PreToolUse).toEqual(theirs.hooks.PreToolUse);
    expect(off.hooks.PostToolUse).toBeUndefined();
  });

  it('leaves nothing behind at all when the file was only ever ours', () => {
    const off = withoutOurHooks(withOurHooks(null, SCRIPT));
    expect(off.hooks.PreToolUse).toBeUndefined();
    expect(off.hooks.PostToolUse).toBeUndefined();
  });

  it('does not mistake somebody else`s hook for ours because of the file name', () => {
    expect(hookIsOurs("/home/me/memory-gate-hook.sh.backup pre")).toBe(false);
    expect(hookIsOurs(`'${SCRIPT}' pre`)).toBe(true);
    expect(hookIsOurs('/home/me/lint.sh')).toBe(false);
    expect(hookIsOurs(undefined)).toBe(false);
  });
});

describe('trusting our hook and nobody else`s', () => {
  // Shapes taken verbatim from a real `hooks/list` answer on this Mac.
  const entry = (over = {}) => ({
    key: '/Users/me/.codex/hooks.json:pre_tool_use:0:0',
    eventName: 'preToolUse',
    handlerType: 'command',
    command: `'${SCRIPT}' pre`,
    currentHash: 'sha256:aaaa',
    trustStatus: 'untrusted',
    enabled: true,
    ...over,
  });

  it('writes one trust edit per hook of ours that is not trusted yet', () => {
    const edits = ourTrustEdits([entry()]);
    expect(edits).toEqual([{
      keyPath: 'hooks.state."/Users/me/.codex/hooks.json:pre_tool_use:0:0".trusted_hash',
      mergeStrategy: 'upsert',
      value: 'sha256:aaaa',
    }]);
  });

  it('never touches a hook that is not ours, however untrusted it is', () => {
    expect(ourTrustEdits([entry({ command: '/home/me/lint.sh' })])).toEqual([]);
  });

  it('asks for nothing when ours is already trusted', () => {
    expect(ourTrustEdits([entry({ trustStatus: 'trusted' })])).toEqual([]);
  });

  it('re-trusts ours when Codex calls it modified, which is how a new app version lands', () => {
    // The script changed with the app, so the hash changed with it. Measured:
    // editing our command turned the status "modified" and it stopped running.
    const edits = ourTrustEdits([entry({ trustStatus: 'modified', currentHash: 'sha256:bbbb' })]);
    expect(edits).toHaveLength(1);
    expect(edits[0].value).toBe('sha256:bbbb');
  });

  it('leaves a managed hook alone, because an admin owns that decision', () => {
    expect(ourTrustEdits([entry({ trustStatus: 'managed' })])).toEqual([]);
  });

  it('quotes the key, which is a path with colons in it', () => {
    const odd = entry({ key: '/Users/me/My "Codex"/hooks.json:pre_tool_use:0:0' });
    const [edit] = ourTrustEdits([odd]);
    expect(edit.keyPath).toBe('hooks.state."/Users/me/My \\"Codex\\"/hooks.json:pre_tool_use:0:0".trusted_hash');
  });

  it('reads a whole hooks/list answer, several cwds at once', () => {
    const answer = [
      { cwd: '/a', hooks: [entry()], warnings: [], errors: [] },
      { cwd: '/b', hooks: [entry({ command: '/home/me/lint.sh' })], warnings: [], errors: [] },
    ];
    expect(ourTrustEdits(answer)).toHaveLength(1);
  });

  it('asks twice for one key only once, when two cwds report the same hook', () => {
    const answer = [
      { cwd: '/a', hooks: [entry()], warnings: [], errors: [] },
      { cwd: '/b', hooks: [entry()], warnings: [], errors: [] },
    ];
    expect(ourTrustEdits(answer)).toHaveLength(1);
  });

  it('survives a hooks/list answer with nothing in it', () => {
    expect(ourTrustEdits([])).toEqual([]);
    expect(ourTrustEdits(null)).toEqual([]);
    expect(ourTrustEdits([{ cwd: '/a', hooks: [], warnings: [], errors: [] }])).toEqual([]);
  });
});
