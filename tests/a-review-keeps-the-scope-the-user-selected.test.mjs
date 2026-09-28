// MP-05 scope validation: whitespace must not turn a branch into custom prose,
// and multiple scope arguments must be refused rather than combined into a ref.
import {it,expect} from 'vitest';
import {reviewTarget} from '../shared/provider-commands.mjs';
it.each(['--base main','--base\tmain','--base\nmain'])('preserves the branch scope in %j',text=>expect(reviewTarget(text)).toEqual({type:'baseBranch',branch:'main'}));
it('preserves commit and custom instruction scopes',()=>{
 expect(reviewTarget('--commit abc1234')).toEqual({type:'commit',sha:'abc1234'});
 expect(reviewTarget('Check deleted files and imports')).toEqual({type:'custom',instructions:'Check deleted files and imports'});
 expect(reviewTarget('')).toEqual({type:'uncommittedChanges'});
});
it.each(['--base','--base main --commit abc1234','--commit abc1234 extra','--unknown main'])('refuses ambiguous or incomplete scope %j',text=>expect(()=>reviewTarget(text)).toThrow());
