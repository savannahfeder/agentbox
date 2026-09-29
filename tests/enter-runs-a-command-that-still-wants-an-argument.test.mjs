// ENTER ON A COMMAND THAT WANTS AN ARGUMENT RUNS IT AND IS TOLD WHAT IT WANTS.
//
// The bug, the day after `/fork` shipped: typing /fork and pressing Return did
// nothing.
//
// That is a rule this app already had and a case it did not cover.
// `w-5d1ad29efa` fixed the same complaint for the commands that take nothing:
// Enter used to fill the box and send nothing, so Enter on `/usage` had no
// visible effect, and Enter was changed to RUN while Tab kept filling.
// The commands that REQUIRE an argument kept the old behaviour, and for those
// Enter fills the box with the very text she had already typed plus a space. On
// `/fork` that is a keystroke with no visible effect at all: same box, same
// words, no menu, no answer, nothing to read.
//
// So Enter runs those too. Both of them refuse harmlessly and say what they
// want (`/rename` names its length limit, `/fork` gives a worked example), which
// is the same thing the menu's hint says and one she can act on, rather than a
// key that appears to be broken. Tab still completes into the box, which is what
// somebody who knows the word wants and is Claude Code's own division of the
// two keys.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerCommands } from '../shared/provider-commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('a command that still wants an argument', () => {
  it('is no longer filled into the box on Enter', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    // The line that made Enter a no-op on `/fork`. Gone on purpose.
    expect(focus).not.toContain("if (row.cmd.argumentHint?.startsWith('<'))");
    // And the two that make Enter run and Tab fill are still the rule.
    expect(focus).toContain("if (how === 'fill') { setText(commandDraft(row.cmd)); ref.current?.focus(); return; }");
    expect(focus).toContain("pickRow(menuRows[slashAt] ?? menuRows[0], e.key === 'Tab' ? 'fill' : 'run');");
  });

  // The ones the old rule caught, so the next command with an angle-bracket
  // hint is held to the same standard rather than quietly going silent again.
  // `/compact` is the proof the old rule was wrong on its own terms: its
  // argument is OPTIONAL in Claude Code's own words and it was filled rather
  // than run anyway, purely because the hint is spelled with brackets.
  it('is every command whose hint is spelled with angle brackets', () => {
    const bracketed = providerCommands('claude-code').filter((c) => c.argumentHint?.startsWith('<'));
    expect(bracketed.map((c) => c.name).sort()).toEqual(['compact', 'fork', 'rename']);
    expect(bracketed.find((c) => c.name === 'compact').argumentHint).toContain('optional');
  });
});
