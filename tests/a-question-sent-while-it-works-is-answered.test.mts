// A QUESTION TYPED WHILE THE AGENT WORKED WAS READ AND NEVER ANSWERED.
//
// Reported 2026-10-06 with a photograph of the thread (w-ac7f0c0cbb). Into
// "Add to it while it works" went "I'm not sure I fully understand. Can you
// explain why you researched the website twice? Was the information lost?".
// The bubble said "Read by the agent" and the agent's next line was "Music
// chosen: a driving electronic track...". It was asked again, "didn't hear back
// from this", also marked read, and again the run carried on. Progress lines
// kept arriving the whole time, so nothing was broken: the message was
// delivered and the agent simply did not treat it as something to answer.
//
// Why it would not. A reply to a session that has FINISHED is wrapped by
// `replyBrief` ("Do what it asks first, before you go back to anything you were
// doing"). A reply steered into a session that is STILL RUNNING was handed over
// as bare words with no framing at all, while the brief that session is holding
// says its last message is the result and "there is no other way to report and
// no second chance at it". Read together that is an instruction to note the
// words and keep working.
//
// So the fix is the missing half of that pair: `liveReplyBrief`, around their
// words only when they are reaching a session that is genuinely mid-turn.
import { it, expect } from 'vitest';
import { submitReply, liveReplyBrief } from '../main/live-replies.mts';

const QUESTION = "I'm not sure I fully understand. Can you explain why you researched the website twice? Was the information lost or something?";

function setup(options = {}) {
  const sent = [];
  const session = { product: 'p', child: { steer: async (text) => { sent.push(text); } }, ...options };
  const supervisor = {
    sessions: new Map([['w', session]]),
    _handledAnswers: new Set(), _answerKey: (i) => i.answer, _saveState() {},
  };
  return { supervisor, session, sent };
}

const send = (supervisor, answer) => submitReply(supervisor, { product: 'p', id: 'w', answer }, () => ({ answer }));

it('hands their question to the running agent with the line that asks for an answer now', async () => {
  const { supervisor, sent } = setup();
  await send(supervisor, QUESTION);
  expect(sent).toHaveLength(1);
  // Their words survive whole: the wrapper adds, it never edits.
  expect(sent[0]).toContain(QUESTION);
  // And the agent is told to answer it in the thread before carrying on. Read
  // with the line breaks flattened, so rewrapping the paragraph is not a break.
  const said = sent[0].replace(/\s+/g, ' ');
  expect(said).toMatch(/answer it in your very next message/i);
  expect(said).toMatch(/before you go back to what you were doing/i);
});

it('keeps the framing out of the thread, where only their own words belong', async () => {
  const { supervisor } = setup();
  const saved = await submitReply(supervisor, { product: 'p', id: 'w', answer: QUESTION }, () => ({ answer: QUESTION }));
  expect(saved.answer).toBe(QUESTION);
});

it('frames a steering instruction the same way, because an instruction can carry a question too', async () => {
  // "didn't hear back from this: ..." is not shaped like a question either, and
  // it is the second message they sent. One shape for everything they type, so
  // nothing turns on guessing which of their sentences deserves a reply.
  const { supervisor, sent } = setup();
  await send(supervisor, 'Go with look B, Changelog.');
  expect(sent[0]).toContain('Go with look B, Changelog.');
  expect(sent[0]).toMatch(/answer it in your very next message/i);
});

it('sends a slash command to a held conversation exactly as typed', async () => {
  // Remote Control steers slash commands straight through. Prose wrapped round
  // "/compact" is no longer a command, so this one must never be framed.
  const { supervisor, sent } = setup({ remoteIdle: true });
  await send(supervisor, '/compact');
  expect(sent).toEqual(['/compact']);
});

it('says nothing about working to a conversation that is sitting idle', async () => {
  // A held Remote Control session is not mid-turn. Telling it a message arrived
  // "while you work" would be untrue, and there is nothing to go back to.
  const { supervisor, sent } = setup({ remoteIdle: true });
  await send(supervisor, 'what did you decide about the music?');
  expect(sent).toEqual(['what did you decide about the music?']);
});

it('leaves the words it wraps exactly as they were typed, blank lines and all', () => {
  const two = `${QUESTION}\n\nThe reason I ask is that we switched recently.`;
  expect(liveReplyBrief(two)).toContain(two);
  expect(liveReplyBrief(two).trimEnd().endsWith('The reason I ask is that we switched recently.')).toBe(true);
});
