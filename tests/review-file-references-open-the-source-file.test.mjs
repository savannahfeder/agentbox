// MP-05 live review displayed cart.mjs:2 as dead inline code. Reuse the existing
// artifact link for a source reference; line suffixes are labels, not filenames.
import {it,expect} from 'vitest';
import {sourceReference} from '../renderer/src/source-reference.mjs';
it.each([['cart.mjs:2','cart.mjs'],['src/cart.ts:2-5','src/cart.ts'],['/repo/cart.py#L12','/repo/cart.py'],['./src/view.tsx','./src/view.tsx']])('resolves %s to its actual filename', (text,path)=>expect(sourceReference(text)).toBe(path));
it.each(['total(10,3)','hello world','x.ts\ny.ts','https://example.com/a.js','image.png','cart.mjs:0','../outside.js:2'])('leaves non-references alone: %s',text=>expect(sourceReference(text)).toBeNull());
