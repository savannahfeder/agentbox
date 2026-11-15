// 2026-09-18: a four-file bundle said Review full file. Count-aware copy
// must describe the whole bundle; previews must retain source while coloring it.
import {it,expect} from 'vitest';
import {reviewOpenLabel,reviewSyntax} from '../renderer/src/review-lab';
it('labels bundles, individual files, and unloaded previews honestly',()=>{
 expect(reviewOpenLabel(4)).toBe('Review all files');
 expect(reviewOpenLabel(1)).toBe('Review full file');
 expect(reviewOpenLabel(0)).toBe('Open preview');
});
it('colors keywords and strings without changing source or interpreting markup',()=>{
 const source='export const title = "<hello>";';
 const tokens=reviewSyntax(source);
 expect(tokens.map(t=>t.s).join('')).toBe(source);
 expect(tokens.some(t=>t.c==='kw')).toBe(true);
 expect(tokens.some(t=>t.c==='str')).toBe(true);
 expect(reviewSyntax('')).toEqual([]);
 expect(reviewSyntax('ordinary_identifier').every(t=>!t.c)).toBe(true);
});
