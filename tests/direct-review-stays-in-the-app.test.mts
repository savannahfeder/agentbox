// 2026-09-18: standalone mockups hid the actual task layout. The review lab
// must use real artifact viewers, and must never enable review actions in live mode.
import {it,expect} from 'vitest';
import {reviewLabEnabled} from '../renderer/src/review-lab';
it('enables the in-app exploration only with both fixture mode and its flag',()=>{
 expect(reviewLabEnabled(true,'?reviewLab=1')).toBe(true);
 expect(reviewLabEnabled(true,'?fixtures=1')).toBe(false);
 expect(reviewLabEnabled(false,'?reviewLab=1')).toBe(false);
 expect(reviewLabEnabled(false,'')).toBe(false);
});
it('opens the bundled diff through the same document route as the original sample',async()=>{
 const {api}=await import('../renderer/src/api.ts');
 for(const src of ['review-bundle.change','artifact-layout-sample.change']) {
  expect(await api.resolveDoc({product:'onboard',src})).toEqual({ok:true,opened:src});
 }
 const result=await api.codeChange({product:'onboard',src:'review-bundle.change'});
 expect(result.change.files).toHaveLength(4);
});
