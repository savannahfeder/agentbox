// MP-04: a latest-answer field must not discard the earlier queued correction.
// Preserve ledger order and repeated words; stop at a prior delivery/result.
import {it,expect} from 'vitest';
import {queuedReplyText} from '../main/live-replies.mjs';
const item={product:'p',id:'w',answer:'two',wrote:{answer:{ts:3}}};
const line=(ts,answer)=>({ts,source:'founder',patch:{answer}});
it('includes both queued replies in order',()=>expect(queuedReplyText(item,[line(2,'one'),line(3,'two')],()=>false)).toBe('one\n\ntwo'));
it('keeps identical messages sent twice',()=>expect(queuedReplyText({...item,answer:'one'},[line(2,'one'),line(3,'one')],()=>false)).toBe('one\n\none'));
it('does not replay an earlier delivered reply',()=>expect(queuedReplyText(item,[line(1,'old'),line(2,'one'),line(3,'two')],i=>i.answer==='old')).toBe('one\n\ntwo'));
it('does not pull old replies or withdrawals into a new continuation',()=>expect(queuedReplyText(item,[line(1,'old'),{ts:2,patch:{result:'done'}},line(2.5,'(withdrawn)'),line(3,'two')],()=>false)).toBe('two'));
