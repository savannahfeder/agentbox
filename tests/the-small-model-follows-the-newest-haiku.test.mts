// THE SMALL MODEL FOLLOWS THE NEWEST HAIKU (w-bb45118b10).
//
// Every small call (naming rows, catching up, Auto's routing) ran on
// `claude-haiku-4-5-20251001`, a dated id, while the Claude Code installed here
// already offered Haiku 5.5 under the alias `haiku`
// (shared/claude-models.generated.mts). A pinned id never moves to a newer
// model, and when it is retired every small call fails over to Codex or to no
// answer. The alias is what Claude Code moves along as models come out.
import { describe, it, expect } from 'vitest';
import { NAME_MODEL } from '../main/row-label.mts';
import { harnessFor } from '../main/harnesses.mts';
import { CLAUDE_MODELS } from '../shared/claude-models.generated.mts';

describe('the small model', () => {
  it('is named by the alias Claude Code keeps current, not a dated id', () => {
    expect(NAME_MODEL).toBe('haiku');
  });

  it('is an alias the installed Claude Code offers', () => {
    expect(CLAUDE_MODELS.map((m: { alias?: string }) => m.alias)).toContain(NAME_MODEL);
  });

  it('is what a small call passes to Claude Code', () => {
    const args = harnessFor('claude').smallModelArgs('name this row', NAME_MODEL);
    expect(args[args.indexOf('--model') + 1]).toBe('haiku');
  });

  it('leaves Codex on the model its own login defaults to', () => {
    expect(harnessFor('codex').smallModelArgs('name this row', NAME_MODEL)).not.toContain('--model');
  });
});
