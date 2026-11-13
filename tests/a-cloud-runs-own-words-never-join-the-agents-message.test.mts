// Two power testers (2026-11-09, stand-in cloud) pressed Stop on a cloud thread
// and moved one to this Mac, and the agent's last sentence grew a second line:
// "stderr: agentbox cloud: stopping the cloud run (asked to stop)". Once it was
// "the cloud machine stopped ... commits, files and conversation are lost".
// The supervisor writes a stderr chunk with no time stamp, and both readers
// took any unstamped line as the sentence above it running on. Measured with
// traceLines on that trace: one say line, the answer plus the stderr text.
import { describe, it, expect } from 'vitest';
import { traceLines } from '../renderer/src/terminal.ts';
import { readNotes } from '../renderer/src/notes.ts';

const startedAt = Date.parse('2026-11-09T22:00:00Z');
const run = (body: string) => ({ startedAt, text: `# a task\n# w-x · spawned ${new Date(startedAt).toISOString()}\n\n${body}` });
const says = (body: string) => traceLines(run(body)).filter((l) => l.kind === 'say').map((l) => l.text);
const steps = (body: string) => readNotes([run(body)])!.steps.map((s) => s.text);

describe("the cloud's own stderr is never part of what the agent said", () => {
  const stopped = [
    '22:00:04  Reading the settings page before I change it.',
    'stderr: agentbox cloud: stopping the cloud run (asked to stop)',
    '',
  ].join('\n');

  it('a Stop leaves the sentence as the agent wrote it', () => {
    expect(says(stopped)).toEqual(['Reading the settings page before I change it.']);
    expect(steps(stopped)).toEqual(['Reading the settings page before I change it.']);
  });

  it('every line of a chunk is skipped, up to the blank line that ends it', () => {
    const lost = [
      '22:00:04  Here is my answer.',
      'stderr: agentbox cloud: the cloud machine stopped after 1 minute',
      'and commits, files and conversation are lost',
      '',
    ].join('\n');
    expect(says(lost)).toEqual(['Here is my answer.']);
    expect(steps(lost)).toEqual(['Here is my answer.']);
  });

  it('what the agent says after the chunk is still drawn', () => {
    const after = `${stopped}22:00:09  Carrying on with the header.\n`;
    expect(says(after)).toEqual(['Reading the settings page before I change it.', 'Carrying on with the header.']);
    expect(steps(after)).toEqual(['Reading the settings page before I change it.', 'Carrying on with the header.']);
  });

  it('a sentence the agent ran onto a second line still joins', () => {
    const wrapped = '22:00:04  The flash comes from the theme loading late,\nso I moved it into the first paint.\n';
    expect(says(wrapped)).toEqual(['The flash comes from the theme loading late,\nso I moved it into the first paint.']);
    expect(steps(wrapped)[0]).toContain('so I moved it into the first paint.');
  });
});
