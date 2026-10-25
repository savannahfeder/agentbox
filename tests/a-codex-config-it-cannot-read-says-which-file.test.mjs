// A CODEX CONFIG IT CANNOT READ SAYS WHICH FILE, NOT "SOMETHING STOPPED".
//
// What broke (found 2026-10-15 by the verify skill's `codex-invalid-config`
// and `codex-own-config` setups, real codex-cli 0.160.0 on homes laid out that
// way). A config.toml codex will not read stops every Codex task before it
// starts, and the person was told only "Codex stopped before it did anything,
// so this task has not been started. Agentbox keeps trying, and it will keep
// failing the same way until this is fixed." Nothing said which thing to fix.
// Two real shapes, copied off the runs' own stderr:
//
//   a quote left open:   codex app-server refused config/read: failed to read
//                        configuration layers: <home>/.codex/config.toml:5:17:
//                        invalid basic string, expected `"`
//   an old default profile, which 0.160 refuses outright (so does their
//   terminal's codex):   ... legacy `profile = "work"` config is no longer
//                        supported; use `--profile work` with
//                        `work.config.toml` instead
//
// Their terminal says the same about the same file ("Error loading
// config.toml: ..."), so the sentence points there.
import { describe, it, expect } from 'vitest';
import { troubleCause, deadRunSentence, needsHerHands, engineTroubleNote } from '../shared/spawn-trouble.mjs';

const SYNTAX = 'codex app-server refused config/read: failed to read configuration layers: /tmp/h/.codex/config.toml:5:17: invalid basic string, expected `"`';
const LEGACY = 'codex app-server refused config/read: failed to resolve feature override precedence: legacy `profile = "work"` config is no longer supported; use `--profile work` with `work.config.toml` instead';
const TERMINAL = 'Error loading config.toml:\n/tmp/h/.codex/config.toml:2:6: key with no value, expected `=`';

describe('a config.toml codex will not read', () => {
  it('a TOML mistake, an old default profile, and the terminal\'s own wording are all that', () => {
    for (const line of [SYNTAX, LEGACY, TERMINAL]) expect(troubleCause(line), line).toBe('codex-config');
  });

  it('the row says which file, and how to find the line', () => {
    const s = deadRunSentence({ engineWord: 'Codex', cause: 'codex-config' });
    expect(s).toMatch(/^Codex could not read its config\.toml/);
    expect(s).toMatch(/run codex in a terminal/i);
    expect(s.split('.')[0].length).toBeLessThan(112);
    expect(engineTroubleNote('codex-config')).toMatch(/config\.toml/);
  });

  it('fixing the file is what brings it back, so it is not benched like a login', () => {
    // A benched account comes back when its sign-in files change, and fixing
    // config.toml changes none of them.
    expect(needsHerHands('codex-config')).toBe(false);
  });

  it('what is not her config keeps its own name', () => {
    // A thread the app's own isolation broke is not her file to fix.
    expect(troubleCause('failed to load configuration: invalid transport in `mcp_servers.planted`')).not.toBe('codex-config');
    expect(troubleCause('unexpected status 401 Unauthorized: Missing bearer or basic authentication in header')).toBe('signed-out');
    expect(troubleCause('You\'ve hit your usage limit. Upgrade to Pro, or try again at Sep 28th, 2026 1:05 PM.')).toBe('at-limit');
    expect(troubleCause('could not read which MCP servers to switch off for this worker')).not.toBe('codex-config');
  });
});
