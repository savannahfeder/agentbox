// MP-05 audit: exitedReviewMode carries the review string, not agentMessage.text.
// Dropping it makes a successful native review look like an unanswered turn.
import {it,expect} from 'vitest';
import {captureCodexEvent,traceCodexEvent} from '../main/codex.mjs';
const review='[P1] Reject negative quantities — cart.js:4';
it('uses the completed review as the final result and trace',()=>{
 const session={};const params={item:{type:'exitedReviewMode',review}};
 captureCodexEvent(session,'item/completed',params);
 expect(session.result).toBe(review);expect(session.resultIsError).toBe(false);
 expect(traceCodexEvent('item/completed',params)).toContain(review);
});
it('recovers review output from the completed turn summary',()=>{
 const session={};captureCodexEvent(session,'turn/completed',{turn:{status:'completed',items:[{type:'exitedReviewMode',review}]}});
 expect(session.result).toBe(review);
});
it('does not treat the review entrance or an interrupted review as success',()=>{
 const session={};captureCodexEvent(session,'item/completed',{item:{type:'enteredReviewMode',review:'Starting review'}});
 expect(session.result).toBeUndefined();
 captureCodexEvent(session,'turn/completed',{turn:{status:'interrupted',items:[{type:'exitedReviewMode',review}]}});
 expect(session.resultIsError).toBe(true);expect(session.result).not.toBe(review);
});
