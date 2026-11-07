// A FORK RUNS ON THE MODEL ITS THREAD WAS ON.
//
// The owner, 2026-11-04: "if the user selects a model, that should definitely
// be the one that gets applied." Found by the Codex review of that change: a
// `/fork` copied the source thread's engine onto the new row and not its model
// or effort level. Measured with a probe on `taskCommand`: a thread on Sonnet
// forked into a row with no model, which then ran on the app's default instead
// (and before that change, on whatever `--model` sat in the config).

import { describe, it, expect } from 'vitest';
import { taskCommand } from '../main/task-commands.mts';

const forkOf = async (source) => {
  const composed = [];
  const sup = {
    _engineFor: () => 'claude',
    rowSessionFor: () => ({ sessionId: 'session-source' }),
    _saveState() {},
    store: {
      readItem: () => source,
      listProducts: () => [],
      composeItem: (product, patch) => { composed.push(patch); return { id: 'w-fork', ...patch }; },
    },
  };
  await taskCommand(sup, 'p', source.id, '/fork try another approach');
  return composed[0];
};
const thread = (patch = {}) => ({ id: 'w-source', product: 'p', status: 'open', title: 'Original', body: 'Work', engine: 'claude', priority: 0, labels: ['founder'], ...patch });

describe('a fork of a thread', () => {
  it('keeps the model and effort level picked on it', async () => {
    const fork = await forkOf(thread({ model: 'sonnet', effort: 'high' }));
    expect(fork.model).toBe('sonnet');
    expect(fork.effort).toBe('high');
  });

  // Nothing picked is copied as nothing, so the fork runs on the app's own
  // model rather than on a word nobody chose.
  it('carries no model when its thread had none', async () => {
    const fork = await forkOf(thread());
    expect('model' in fork).toBe(false);
    expect('effort' in fork).toBe(false);
  });
});
