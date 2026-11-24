// AN OPEN SESSION PAGE FOLLOWS THE SESSION.
//
// Two power testers on w-34f79ab66e (2026-11-22), each twice: with a Codex
// session's page open, they allowed its command in the terminal; the header
// went to In progress and Needs you dropped by one, but the page went on
// showing the command and "Answer this one in the terminal". The open row was
// the copy taken when it was opened, and only ledger rows were ever refreshed.

import { describe, it, expect } from 'vitest';
import { freshAgentRow } from '../renderer/src/stay-with-a-command.ts';

const asking = { id: 'agent:codex:s1', product: 'shop', agent: { status: 'waiting', approval: { command: 'ls', reason: 'May I list?' }, lastSaid: '' } };
const working = { ...asking, agent: { status: 'busy', approval: null, lastSaid: '' } };

describe('the open page of a session', () => {
  it('takes the newer row once the session has moved on', () => {
    expect(freshAgentRow([working], asking)).toBe(working);
  });
  it('leaves an unchanged row alone, so the page is not redrawn on every reading', () => {
    expect(freshAgentRow([{ ...asking, agent: { ...asking.agent } }], asking)).toBeNull();
  });
  it('leaves an ordinary thread to the ledger refresh', () => {
    expect(freshAgentRow([{ id: 't1', product: 'shop' }], { id: 't1', product: 'shop' })).toBeNull();
  });
  it('keeps what it has when the session has gone from the list', () => {
    expect(freshAgentRow([], asking)).toBeNull();
  });
});
