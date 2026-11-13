// A FILE SENT FROM THE "NEEDS A FILE" CARD GOES WITH A NEW CLOUD RUN.
//
// Reported 2026-11-13: a cloud thread asked for a 32 MB video four or five
// times and never got it, though each Send said "I sent it". A cloud session
// stays open for a while after it answers, and a reply then is written into
// that open session. But a file from the card only travels when a cloud run
// starts (AGENTBOX_SEND_FILES, given at spawn), so the reply told the agent
// "it is at that same path on your machine now" while the file stayed on the
// Mac, and the agent asked again. Measured on the run that took the report:
// no AGENTBOX_SEND_FILES in its environment and no file at the path, while a
// file attached to the message itself (which starts a new run) arrived.
//
// Now a reply that carries a file waiting for the cloud is saved instead of
// written into the open session; the tick ends the wait, and the new run takes
// the reply and the file together.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { submitReply } from '../main/live-replies.mts';
import { Supervisor } from '../main/supervisor.mts';

describe('a reply that carries a file for the cloud', () => {
  function setup(session: Record<string, unknown>, waiting: boolean) {
    const sent: string[] = [];
    const saved: string[] = [];
    const s = { product: 'p', child: { steer: async (text: string) => { sent.push(text); } }, ...session };
    const supervisor = {
      sessions: new Map([['w', s]]),
      _handledAnswers: new Set<string>(), _answerKey: (i: { answer?: string | null }) => String(i.answer), _saveState() {},
      nextReplyBrief: (_p: string, id: string, answer: string) => `REPLY BRIEF for ${id}: ${answer}`,
      redeliverAnswer() {}, deliverMidflightReply() {},
      hasFilesForCloud: (id: string) => waiting && id === 'w',
    };
    const commit = (answer: string) => () => { saved.push(answer); return { answer }; };
    return { supervisor, sent, saved, commit };
  }
  const words = 'I sent ~/Movies/face.mp4. It is at that same path on your machine now.';

  it('is saved for a new run, not written into a session waiting between turns', async () => {
    const { supervisor, sent, saved, commit } = setup({ between: true }, true);
    await submitReply(supervisor as never, { product: 'p', id: 'w', answer: words, status: 'open' }, commit(words));
    expect(sent).toEqual([]);
    expect(saved).toEqual([words]);
  });

  it('is saved too when the session is still working, since only a new run takes the file', async () => {
    const { supervisor, sent, saved, commit } = setup({}, true);
    await submitReply(supervisor as never, { product: 'p', id: 'w', answer: words, status: 'open' }, commit(words));
    expect(sent).toEqual([]);
    expect(saved).toEqual([words]);
  });

  it('a reply with no file waiting still goes straight into the open session', async () => {
    const { supervisor, sent, commit } = setup({ between: true }, false);
    await submitReply(supervisor as never, { product: 'p', id: 'w', answer: 'carry on', status: 'open' }, commit('carry on'));
    expect(sent).toEqual(['REPLY BRIEF for w: carry on']);
  });
});

describe('the file waiting for the cloud', () => {
  let tmp: string | null = null;
  afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; });

  it('ends the open session on the tick, and the next cloud run is given the file', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-file-'));
    const file = path.join(tmp, 'face.mp4');
    fs.writeFileSync(file, Buffer.alloc(1024));
    const row: Record<string, unknown> = { id: 'w-film', product: 'p', status: 'claimed', epoch: 3, labels: ['founder'], title: 'Outreach films', wrote: {} };
    const store = {
      listItems: () => [row], listProducts: () => [{ slug: 'p', name: 'P', dir: path.join(tmp!, 'p') }], isDue: () => true,
      readItem: () => row, settleAnswer: () => {}, releaseRunClaim: () => {},
      recordSessionResult: (_s: string, _i: string, patch: Record<string, unknown>) => { row.result = patch.result; row.wrote = { ...(row.wrote as object), result: { source: 'agent', ts: Date.now() } }; },
    };
    const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store as never, tmp);
    sup._saveState = () => {};
    const steered: string[] = [];
    let open = true;
    const session = {
      itemId: 'w-film', product: 'p', startedAt: Date.now() - 60_000, tail: [], cloud: true, engine: 'claude', ranOn: { model: null, effort: null },
      result: 'Send the video so I can finish.', between: false,
      child: { steer: async (t: string) => { steered.push(t); }, stopWaiting: () => { open = false; }, waitingForNext: () => open },
    };
    sup.sessions.set('w-film', session as never);
    sup._turnOver(row as never, session as never, { continuation: false, answerAtSpawn: null });
    expect(session.between).toBe(true);

    sup.cloudSendFile('w-film', file);
    const answer = `I sent ${file}. It is at that same path on your machine now.`;
    await submitReply(sup as never, { product: 'p', id: 'w-film', answer, status: 'open' }, () => {
      Object.assign(row, { status: 'open', answer, wrote: { ...(row.wrote as object), answer: { ts: Date.now() + 1, source: 'founder' } } });
      return row as never;
    });
    expect(steered).toEqual([]);
    sup.endWaitsOvertaken([row as never]);
    expect(open).toBe(false);
    expect(JSON.parse(String(sup._cloudRelayEnv({ ZERO_ITEM: 'w-film' }).AGENTBOX_SEND_FILES))).toEqual([file]);
  });

  it('is known to be waiting from Send until a cloud run is given it, and only for its own thread', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-file-'));
    const file = path.join(tmp, 'face.mp4');
    fs.writeFileSync(file, Buffer.alloc(1024));
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
    const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store as never, tmp);
    expect(sup.hasFilesForCloud('w-a')).toBe(false);
    sup.cloudSendFile('w-a', file);
    expect(sup.hasFilesForCloud('w-a')).toBe(true);
    expect(sup.hasFilesForCloud('w-b')).toBe(false);
    const env = sup._cloudRelayEnv({ ZERO_ITEM: 'w-a' });
    expect(JSON.parse(String(env.AGENTBOX_SEND_FILES))).toEqual([file]);
    expect(sup.hasFilesForCloud('w-a')).toBe(false);
  });
});
