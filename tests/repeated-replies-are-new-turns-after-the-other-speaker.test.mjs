// A real Claude follow-up returned the same confirmation code twice. The
// global text dedupe hid its second reply, leaving the user's message last.
import {it,expect} from 'vitest';
import {threadOf} from '../shared/work-items.mjs';
const line=(ts,field,text)=>({id:'w-example',ts,source:field==='answer'?'founder':'agent',patch:{[field]:text}});
it('keeps the same result after a new user reply',()=>{
 const turns=threadOf([line(1,'result','OK'),line(2,'answer','Again?'),line(3,'result','OK')],'w-example');
 expect(turns.map(t=>t.text)).toEqual(['OK','Again?','OK']);
 expect(turns.at(-1).ts).toBe(3);
});
it('keeps a repeated user answer after an agent responds',()=>{
 expect(threadOf([line(1,'answer','Continue'),line(2,'result','Ready'),line(3,'answer','Continue')],'w-example').map(t=>t.text)).toEqual(['Continue','Ready','Continue']);
});
it('still removes duplicate writes without an intervening reply and unchanged bodies',()=>{
 expect(threadOf([line(1,'body','Task'),line(2,'result','OK'),line(3,'result','OK'),line(4,'answer','Again?'),line(5,'body','Task'),line(6,'result','OK')],'w-example').map(t=>t.text)).toEqual(['Task','OK','Again?','OK']);
});
