// A REPLY ON THE PHONE CAN WAIT FOR A TIME, OR MOVE THE THREAD TO THE OTHER AGENT.
//
// The desktop's reply box has Send later on a caret beside Send
// (components/ReplyLater.tsx) and a model menu whose other column moves the
// thread to the other agent (threads/ModelMenu.tsx, reply-pick.ts). The phone
// app's reply box had neither, on 2026-11-08: a reply already carried `runAt`
// to the computer, but nothing on the phone set it, and an `engine` on a reply
// was dropped on the way (shared/phone-snapshot.mjs CHOICES.reply had no
// engine). Held here: the times offered, a reply set for later that does not
// clear its own time, the agent a pick moves to and what the reply then names,
// and the engine reaching the window's zero:answer.
import { describe, it, expect } from 'vitest';
import { applyThrough } from '../main/phone-inbox.mts';
import { commandFor, phoneSlug } from '../renderer/src/phone-rows';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mts';
import { mondayMorning, tomorrowMorning } from '../renderer/src/threads/composer-rules';
import { replyChoices, replyModel } from '../mobile/src/lib/compose';
import { replyLaterRows } from '../mobile/src/lib/later';
import { planFor } from '../mobile/src/lib/actions';

// A Wednesday, so tomorrow morning and Monday morning are two times.
const NOW = new Date(2026, 10, 11, 15, 0).getTime();
const A = phoneSlug('a1b2c3d4e5f6', 'alpha');
const item = (over = {}) => ({ id: 'w-1', product: A, productName: 'Alpha', title: 'Draw it', status: 'blocked', ...over });
const two = { engines: [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex' }], workspace: 'claude', codexModels: [{ id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }], codexDefault: 'gpt-6.1-sol' };
const one = { ...two, engines: [{ id: 'claude', label: 'Claude Code' }] };

describe('Send later on a reply', () => {
  it('offers the desktop\'s two mornings, and Remove the time once one is set', () => {
    expect(replyLaterRows(NOW, 0).map((r) => r.label)).toEqual(['Tomorrow morning', 'Monday morning']);
    expect(replyLaterRows(NOW, 0).map((r) => r.ts)).toEqual([tomorrowMorning(NOW), mondayMorning(NOW)]);
    const set = replyLaterRows(NOW, tomorrowMorning(NOW));
    expect(set.map((r) => [r.label, r.on ?? false])).toEqual([['Remove the time', false], ['Tomorrow morning', true], ['Monday morning', false]]);
    expect(set[0].ts).toBe(0);
  });

  it('sends the reply with its time, and leaves the time alone', () => {
    const at = tomorrowMorning(NOW);
    const plan = planFor({ kind: 'reply', text: 'Go on', choices: { runAt: at } }, item({ runAt: NOW + 3600_000 }), NOW);
    expect(plan.steps).toEqual([{ door: 'answer', payload: { product: A, id: 'w-1', runAt: at, answer: 'Go on', status: 'open' } }]);
    expect(plan.toast).toMatch(/^Sends tomorrow 8:00am → Alpha · press Z to undo$/);
  });

  it('a reply sent now still brings a thread put off back, as before', () => {
    const plan = planFor({ kind: 'reply', text: 'Go on' }, item({ runAt: NOW + 3600_000 }), NOW);
    expect(plan.steps.map((s) => s.door)).toEqual(['answer', 'schedule']);
    expect(plan.toast).toBe('Sent → Alpha · press Z to undo');
  });
});

describe('the other agent, from the reply box', () => {
  it('a pick of Codex on a Claude thread shows Codex and its own default', () => {
    expect(replyModel(item({ engine: 'claude', model: 'opus' }), { engine: 'codex' }, two)).toMatchObject({ engine: 'codex', model: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' });
  });

  it('names the agent, and clears the other agent\'s model and level, only when it moves', () => {
    expect(replyChoices(item({ engine: 'claude', model: 'opus', effort: 'high' }), { engine: 'codex' }, two)).toEqual({ engine: 'codex', model: null, effort: null });
    expect(replyChoices(item({ engine: 'codex' }), { engine: 'claude' }, two)).toEqual({ engine: 'claude', model: 'opus', effort: null });
    expect(replyChoices(item({ engine: 'claude' }), { engine: 'codex', model: 'gpt-6.1-sol', effort: 'low' }, two)).toEqual({ engine: 'codex', model: 'gpt-6.1-sol', effort: 'low' });
  });

  it('says nothing of agents when the pick is the thread\'s own, or the computer has one', () => {
    expect(replyChoices(item({ engine: 'claude' }), { engine: 'claude', model: 'sonnet' }, two)).toEqual({ model: 'sonnet' });
    expect(replyChoices(item({ engine: 'claude' }), { engine: 'codex' }, one)).toEqual({});
    expect(replyChoices(item(), { priority: 9 }, two)).toEqual({ priority: 9 });
  });

  it('reaches the window\'s zero:answer with the reply', async () => {
    const cmd = commandFor(REQUEST_CHANNELS.answer, { product: A, id: 'w-1', answer: 'Go on', engine: 'codex', model: null });
    expect(cmd.payload).toEqual({ text: 'Go on', engine: 'codex', model: null });
    expect(commandFor(REQUEST_CHANNELS.answer, { product: A, id: 'w-1', answer: 'Go on', engine: '../x' }).payload).toEqual({ text: 'Go on' });
    const calls = [];
    const apply = applyThrough(new Map([['zero:answer', async (_e, args) => { calls.push(args); return { ok: true }; }]]));
    await apply({ id: 'c-1', kind: 'reply', project: 'alpha', item: 'w-1', payload: cmd.payload });
    expect(calls[0]).toMatchObject({ product: 'alpha', id: 'w-1', answer: 'Go on', engine: 'codex', model: null });
  });
});
