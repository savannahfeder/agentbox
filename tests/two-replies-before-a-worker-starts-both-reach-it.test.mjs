// MP-04: a latest-answer field must not discard the earlier queued correction.
// Preserve ledger order and repeated words; stop at a prior delivery/result.
import {it,expect} from 'vitest';
import {queuedReplyText} from '../main/live-replies.mjs';
const item={product:'p',id:'w',answer:'two',wrote:{answer:{ts:3}}};
const line=(ts,answer)=>({ts,source:'founder',patch:{answer}});
const both=(a,b)=>`The person wrote:\n\n${a}\n\nThe person wrote:\n\n${b}`;
it('includes both queued replies in order, each marked as its own message',()=>expect(queuedReplyText(item,[line(2,'one'),line(3,'two')],()=>false)).toBe(both('one','two')));
it('keeps identical messages sent twice',()=>expect(queuedReplyText({...item,answer:'one'},[line(2,'one'),line(3,'one')],()=>false)).toBe(both('one','one')));
it('does not replay an earlier delivered reply',()=>expect(queuedReplyText(item,[line(1,'old'),line(2,'one'),line(3,'two')],i=>i.answer==='old')).toBe(both('one','two')));
it('does not replay a reply a finished run settled',()=>expect(queuedReplyText({...item,answeredThrough:2},[line(1,'old'),line(2,'one'),line(3,'two')],()=>false)).toBe('two'));
it('does not pull old replies or withdrawals into a new continuation',()=>expect(queuedReplyText(item,[line(1,'old'),{ts:2,patch:{result:'done'}},line(2.5,'(withdrawn)'),line(3,'two')],()=>false)).toBe('two'));
