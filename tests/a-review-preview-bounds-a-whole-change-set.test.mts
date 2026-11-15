// 2026-09-18: a change set must be one bounded preview, not a card per file.
import {it,expect} from 'vitest';
import {reviewFileSummary} from '../renderer/src/review-lab';
it('shows small sets in full and bounds large sets',()=>{
 expect(reviewFileSummary([])).toEqual({visible:[],remaining:0,total:0});
 expect(reviewFileSummary(['a','b','c'])).toEqual({visible:['a','b','c'],remaining:0,total:3});
 expect(reviewFileSummary(['a','b','c','d'])).toEqual({visible:['a','b','c'],remaining:1,total:4});
 expect(reviewFileSummary(Array(100).fill('file')).visible).toHaveLength(3);
});
