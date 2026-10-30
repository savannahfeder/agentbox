// A new teammate asks its setup questions as one message each, with answers
// to tap (w-615b74b8cb). There was no way to answer one in your own words:
// the box at the foot answered all of them at once, and tapping an answer
// sent it on the spot, after which every other question read as answered by
// it and lost its buttons. Measured on a four-question setup chat: one tap
// left three questions with nothing to tap.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { answerTo, answersMessage, questionOf } from '../renderer/src/teammates/chat-lines.ts';
import { appHome } from '../main/store/home.mjs';
import { Teammates } from '../main/teammates.mjs';

const ADA = 't-aaaaaaaaaa';
const ask = (id, text, ts, options) => ({ id, kind: 'msg', from: ADA, to: [], text, ts, options });
const mine = (id, text, ts, extra = {}) => ({ id, kind: 'msg', from: 'you', to: [ADA], text, ts, ...extra });
const view = (chat) => ({ list: [], chat, runs: [] });

const Q1 = ask('m-q1', 'New here. First question: should I wake on a schedule, or only when you ask?', 10, ['Only when I ask', 'Weekday mornings']);
const Q2 = ask('m-q2', 'Second: what should I pick up first? The film is with you, so I left it.', 11, ['Nothing yet', 'The warm-up']);
const Q3 = ask('m-q3', 'Is that the right line?', 12, ['Yes', 'No']);

describe('answering a teammate\'s questions one by one', () => {
  it('each question reads its own answer from one message that answers several', () => {
    const sent = mine('m-a', 'x', 20, { answers: { 'm-q1': 'Only when I ask', 'm-q2': 'Start on the launch film, in my words' } });
    const v = view([Q1, Q2, Q3, sent]);
    expect(answerTo(v, Q1)).toBe('Only when I ask');
    expect(answerTo(v, Q2)).toBe('Start on the launch film, in my words');
    // One you left out is still waiting on you.
    expect(answerTo(v, Q3)).toBeNull();
  });

  it('a question left out is answered by what you send it later', () => {
    const v = view([Q1, Q3, mine('m-a', 'x', 20, { answers: { 'm-q1': 'Weekday mornings' } }), mine('m-b', 'Yes, but ask me first', 30)]);
    expect(answerTo(v, Q3)).toBe('Yes, but ask me first');
    expect(answerTo(v, Q1)).toBe('Weekday mornings');
  });

  it('a plain message still answers every question before it, as it did', () => {
    const v = view([Q1, Q2, mine('m-a', 'Only when I ask', 20)]);
    expect(answerTo(v, Q1)).toBe('Only when I ask');
    expect(answerTo(v, Q2)).toBe('Only when I ask');
  });

  it('names the question a message asks', () => {
    expect(questionOf(Q1.text)).toBe('Should I wake on a schedule, or only when you ask?');
    expect(questionOf(Q2.text)).toBe('What should I pick up first?');
    expect(questionOf(Q3.text)).toBe('Is that the right line?');
    expect(questionOf('Tell me which one. I will wait.')).toBe('Tell me which one.');
  });

  it('writes several answers as one message the teammate can read without the chat', () => {
    const m = answersMessage([Q1, Q2, Q3], { 'm-q1': 'Only when I ask', 'm-q3': '  My own line  ' });
    expect(m.answers).toEqual({ 'm-q1': 'Only when I ask', 'm-q3': 'My own line' });
    expect(m.text).toBe('> Should I wake on a schedule, or only when you ask?\n\nOnly when I ask\n\n> Is that the right line?\n\nMy own line');
  });

  it('one question answered is just the answer', () => {
    const m = answersMessage([Q1], { 'm-q1': 'Weekday mornings' });
    expect(m).toEqual({ text: 'Weekday mornings', answers: { 'm-q1': 'Weekday mornings' } });
    expect(answersMessage([Q1, Q2], {})).toEqual({ text: '', answers: {} });
  });
});

describe('the store keeps which question each answer is for', () => {
  let team;
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(appHome(), 'own-answers-'));
    team = new Teammates({ productDir: () => dir, listProducts: () => [], listItems: () => [] });
    team.dir = () => dir;
    team.list = () => [{ id: ADA, name: 'Ada' }];
  });

  it('keeps the answers with your message, and drops what is not words', () => {
    const line = team.post({ text: 'Only when I ask', to: [ADA], answers: { 'm-q1': ' Only when I ask ', 'm-q2': 7, 'm-q3': '' } });
    expect(line.answers).toEqual({ 'm-q1': 'Only when I ask' });
    expect(team.chat().messages.find((m) => m.id === line.id).answers).toEqual({ 'm-q1': 'Only when I ask' });
  });

  it('a message with no answers carries none', () => {
    expect(team.post({ text: 'hello', to: [ADA] }).answers).toBeUndefined();
    expect(team.post({ text: 'hello', to: [ADA], answers: 'nope' }).answers).toBeUndefined();
  });

  it('the app passes your answers through to the store', () => {
    const ipc = fs.readFileSync(path.join(import.meta.dirname, '../main/ipc.mjs'), 'utf8');
    expect(ipc).toMatch(/mates\.post\(\{[^}]*answers: a\.answers/);
  });
});

describe('the setup chat', () => {
  const page = fs.readFileSync(path.join(import.meta.dirname, '../renderer/src/teammates/TeammatesPage.tsx'), 'utf8');
  it('offers your own words under every question, and sends several answers together', () => {
    expect(page).toMatch(/Write your own/);
    expect(page).toMatch(/Send answers/);
    expect(page).toMatch(/answersMessage\(/);
  });
});
