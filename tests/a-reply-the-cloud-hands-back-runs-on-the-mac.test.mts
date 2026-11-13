// A REPLY THE CLOUD HANDS BACK RUNS ON THE MAC.
//
// Reported 2026-11-13 with a screenshot: a cloud run answered, then waited ten
// minutes for the next reply. The person replied ("it's running, ... permission
// to run that all locally"), the reply went straight into that waiting run, and
// the run ended on the hand-back line. The thread read "Moved to this Mac" and
// then sat in the inbox with nothing running, and a "continue" a minute later
// did not start it either. A reply steered into a run is marked handled the
// moment it goes in (main/live-replies.mts), and the hand-back released only the
// reply the run was started for, so the scheduler read every reply typed into
// the run as already answered.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { queuedReplyText } from '../main/live-replies.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

const SETTLED = 1_000_000;
const REPLY = SETTLED + 300_000;
const CONTINUE = REPLY + 100_000;

let tmp: string | null = null;
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; });

function cloudRunThatTook(replies: { answer: string; ts: number }[], result: string) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-back-reply-'));
  const last = replies.at(-1)!;
  const row = {
    id: 'w-stripe', product: 'p', status: 'open', labels: ['founder'], title: 'Stripe',
    answer: last.answer, answeredThrough: SETTLED, wrote: { answer: { ts: last.ts, source: 'founder' } },
  };
  const store = {
    listItems: () => [row],
    listProducts: () => [{ slug: 'p', name: 'P', dir: path.join(tmp!, 'p') }],
    readItem: () => row,
  };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
  sup._saveState = () => {};
  const asItem = (r: { answer: string; ts: number }) => ({ ...row, answer: r.answer, wrote: { answer: { ts: r.ts, source: 'founder' } } });
  // What `submitReply` does for each reply it steers into a live run.
  for (const r of replies) sup._handledAnswers.add(sup._answerKey(asItem(r)));
  const session = { itemId: row.id, product: 'p', cloud: true, engine: 'claude', result, lastLiveReply: asItem(last), startedAt: SETTLED - 60_000 };
  const handedBack = sup._noteCloudHandBack(row, session, null);
  const history = replies.map((r) => ({ ts: r.ts, source: 'founder', patch: { answer: r.answer } }));
  const queued = queuedReplyText(row, history, (c) => sup._answerDelivered(c));
  return { sup, row, asItem, handedBack, queued };
}

it('a reply typed into the waiting run is owed a run here once that run hands the thread back', () => {
  const { sup, row, handedBack, queued } = cloudRunThatTook(
    [{ answer: "it's running, run it all locally", ts: REPLY }],
    `${HAND_BACK} their Mac's Keychain`,
  );
  expect(handedBack).toBe(true);
  expect(sup._answerDelivered(row)).toBe(false);
  expect(queued).toContain("it's running, run it all locally");
});

it('two replies typed into it are both carried, not only the newest', () => {
  const { sup, row, queued } = cloudRunThatTook(
    [{ answer: "it's running, run it all locally", ts: REPLY }, { answer: 'continue', ts: CONTINUE }],
    `I need the Mac for this.\n${HAND_BACK} their Mac's Keychain`,
  );
  expect(sup._answerDelivered(row)).toBe(false);
  expect(queued).toContain("it's running, run it all locally");
  expect(queued).toContain('continue');
});

it('a reply already answered before the hand-back stays answered', () => {
  const { sup, asItem } = cloudRunThatTook(
    [{ answer: 'older, already answered', ts: SETTLED - 1 }, { answer: 'continue', ts: CONTINUE }],
    `${HAND_BACK} their Mac's Keychain`,
  );
  expect(sup._answerDelivered(asItem({ answer: 'older, already answered', ts: SETTLED - 1 }))).toBe(true);
});

it("another thread's reply is left alone", () => {
  const other = { id: 'w-other', product: 'p', answer: 'go', wrote: { answer: { ts: CONTINUE } } };
  tmp = null;
  const run = cloudRunThatTook([{ answer: 'continue', ts: CONTINUE }], `${HAND_BACK} Xcode`);
  run.sup._handledAnswers.add(run.sup._answerKey(other));
  run.sup._noteCloudHandBack(run.row, { cloud: true, result: `${HAND_BACK} Xcode` }, null);
  expect(run.sup._handledAnswers.has(run.sup._answerKey(other))).toBe(true);
});

it('a note the handed-back run left on the row does not settle the reply as it exits', () => {
  const { sup, row, asItem } = cloudRunThatTook([{ answer: 'continue', ts: CONTINUE }], `${HAND_BACK} their Mac's Keychain`);
  const settled: number[] = [];
  sup.store.settleAnswer = (_p: string, _id: string, ts: number) => { settled.push(ts); };
  sup.spokeOnTheRow = () => true;
  const spawnedFor = { ...row, wrote: { answer: { ts: SETTLED } } };
  const handedBack = { cloud: true, handedBack: true, result: `${HAND_BACK} x`, lastLiveReply: asItem({ answer: 'continue', ts: CONTINUE }) };
  expect(sup.settleLiveReply(spawnedFor, handedBack)).toBe('undelivered');
  expect(settled).toEqual([]);
  expect(sup._answerDelivered(row)).toBe(false);
  // The same exit without a hand-back is an answered reply.
  expect(sup.settleLiveReply(spawnedFor, { ...handedBack, handedBack: false, result: 'Done.' })).toBe('delivered');
});

it('a cloud turn that answers without handing back keeps the reply answered', () => {
  const { sup, row, handedBack } = cloudRunThatTook(
    [{ answer: 'continue', ts: CONTINUE }],
    'Done. The app moves a thread when a run ends on AGENTBOX-NEEDS-THE-COMPUTER: and this one did not.',
  );
  expect(handedBack).toBe(false);
  expect(sup._answerDelivered(row)).toBe(true);
});
