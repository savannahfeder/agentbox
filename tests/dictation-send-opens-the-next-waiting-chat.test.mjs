// Sending a recording must leave its chat before transcription finishes, without opening personal todos.
import {it,expect} from 'vitest';import {nextAfterDictation} from '../renderer/src/advance';
it('chooses the next waiting chat and skips saved todos',()=>{const a={id:'a',product:'p'},b={id:'b',product:'p'};expect(nextAfterDictation([a,{id:'todo',product:'p',start:'manual'},b],a)).toBe(b)});
it('uses the previous waiting chat after the last one and clears an empty queue',()=>{const a={id:'a',product:'p'},b={id:'b',product:'p'};expect(nextAfterDictation([a,b],b)).toBe(a);expect(nextAfterDictation([a],a)).toBeNull()});
it('can leave an in-progress chat and preserves identical ids in different projects',()=>{const a={id:'a',product:'p'},b={id:'a',product:'q'};expect(nextAfterDictation([a,b],a)).toBe(b);expect(nextAfterDictation([a],{id:'running',product:'p'})).toBe(a)});
