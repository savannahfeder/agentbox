// 2026-09-18: the review card spent 180px on five clipped lines. Show a
// bounded, numbered excerpt of actual changes, without inventing content.
import {it,expect} from 'vitest';
import {reviewExcerpt} from '../renderer/src/review-lab';
it('keeps change markers and line numbers',()=>{
 expect(reviewExcerpt([['=','start'],['-','old'],['+','new']])).toEqual([{mark:'=',text:'start',line:1},{mark:'-',text:'old',line:2},{mark:'+',text:'new',line:3}]);
});
it('caps long excerpts at six rows and preserves short and empty files',()=>{
 expect(reviewExcerpt(Array.from({length:7},()=>['+','line']))).toHaveLength(6);
 expect(reviewExcerpt([['+','only']])).toHaveLength(1);
 expect(reviewExcerpt([])).toEqual([]);
});
