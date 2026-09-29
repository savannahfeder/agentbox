// A review reference may name a .py or .sh file. Opening it must ask for a text
// editor, never the file's executable association, and paths are literal argv.
import {it,expect,vi} from 'vitest';
import {openSourceFile} from '../main/open-source-file.mjs';
it('uses text-editor mode with a literal absolute path',async()=>{
 const run=vi.fn(async()=>{});await openSourceFile('/repo/a $(touch nope).py',run);
 expect(run).toHaveBeenCalledWith('/usr/bin/open',['-t','/repo/a $(touch nope).py'],{timeout:10000});
});
it('refuses unresolved relative paths',async()=>{const run=vi.fn();await expect(openSourceFile('-a Terminal',run)).rejects.toThrow();expect(run).not.toHaveBeenCalled();});
it('reports editor launch failure',async()=>{await expect(openSourceFile('/repo/a.py',async()=>{throw Error('launch failed');})).rejects.toThrow('launch failed');});
