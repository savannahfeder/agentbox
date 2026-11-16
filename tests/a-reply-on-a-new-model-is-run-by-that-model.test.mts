// You picked GPT-6.1-Sol in the reply box of a cloud thread that had run on
// Claude, asked for a fix and sent it. The reply went into the old Claude
// session, still open between turns, and the only answer was "I switched this
// thread to Codex, so the next turn makes the fix". No next turn came. Two
// overnight testers hit it nine times on 2026-11-16, Claude to Codex and Sol to
// Terra alike. A reply that picks another engine, model or effort is now saved
// for a new run on that pick, as a slash command between turns already is.
import { describe, it, expect } from 'vitest';
import { submitReply } from '../main/live-replies.mts';

function setup(session: Record<string, unknown>) {
  const sent: string[] = [];
  const saved: string[] = [];
  const s = { product: 'p', engine: 'claude', ranOn: { model: 'opus', effort: null }, child: { steer: async (text: string) => { sent.push(text); } }, ...session };
  const supervisor = {
    sessions: new Map([['w', s]]),
    _handledAnswers: new Set<string>(), _answerKey: (i: { answer?: string | null }) => String(i.answer), _saveState() {},
    nextReplyBrief: (_p: string, _id: string, answer: string) => `BRIEF: ${answer}`,
    redeliverAnswer() {}, deliverMidflightReply() {},
  };
  const reply = (answer: string, moves?: Record<string, string | null>) => submitReply(supervisor as never,
    { product: 'p', id: 'w', answer, status: 'open', ...(moves ? { moves } : {}) }, () => { saved.push(answer); return { answer }; });
  return { sent, saved, reply };
}

describe('a reply to a cloud session waiting between turns', () => {
  it('is saved for a new run when it moves the thread to another engine', async () => {
    const { sent, saved, reply } = setup({ between: true });
    await reply('make the focus fix', { engine: 'codex', model: 'gpt-6.1-sol' });
    expect(sent).toEqual([]);
    expect(saved).toEqual(['make the focus fix']);
  });

  it('is saved for a new run when it moves to another model on the same engine', async () => {
    const { sent, reply } = setup({ between: true, engine: 'codex', ranOn: { model: 'gpt-6.1-sol', effort: null } });
    await reply('review it', { engine: 'codex', model: 'gpt-6.1-terra' });
    expect(sent).toEqual([]);
  });

  it('is saved for a new run when it changes the effort', async () => {
    const { sent, reply } = setup({ between: true });
    await reply('think harder', { engine: 'claude', model: 'opus', effort: 'high' });
    expect(sent).toEqual([]);
  });

  it('still goes straight in when the pick is what it already runs on', async () => {
    const { sent, reply } = setup({ between: true });
    await reply('carry on', { engine: 'claude', model: 'opus' });
    expect(sent).toEqual(['BRIEF: carry on']);
  });

  it('still goes straight in when nothing was picked', async () => {
    const { sent, reply } = setup({ between: true });
    await reply('carry on');
    expect(sent).toEqual(['BRIEF: carry on']);
  });
});

describe('a reply to a session still working', () => {
  it('goes in as before, and the pick waits for the next run', async () => {
    const { sent, reply } = setup({});
    await reply('also check the footer', { engine: 'codex', model: 'gpt-6.1-sol' });
    expect(sent).toHaveLength(1);
  });
});
