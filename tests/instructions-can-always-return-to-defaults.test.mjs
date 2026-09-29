// 2026-09-14: every instruction layer editable, recoverable to shipped text.
// Measure exact bytes after save/reset; unknown IDs must never write a path.
//
// THREE IDS SINCE w-3dc46f3a67 (2026-09-22), where there were four. `writing`
// and `finishing` are one document now, `messages`, because the split between
// how an agent writes during a task and how it ends one was ours and not hers.
import {expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readInstruction,writeInstruction} from '../main/instruction-settings.mjs';
it.each(['rules','messages','system'])('%s restores its immutable default',id=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'instructions-'));
 try {
  const initial=readInstruction(dir,id);
  writeInstruction(dir,id,'changed');
  expect(readInstruction(dir,id).text).toBe('changed');
  writeInstruction(dir,id,initial.defaultText);
  expect(readInstruction(dir,id).text).toBe(initial.defaultText);
  writeInstruction(dir,id,''); expect(readInstruction(dir,id).text).toBe('');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
it('rejects unknown IDs and non-string edits',()=>{
 expect(()=>readInstruction('/tmp','../anything')).toThrow();
 expect(()=>writeInstruction('/tmp','rules',null)).toThrow();
});
it('keeps packaged edits in writable data and leaves the shipped template intact',async()=>{
 const {readSystemTemplate}=await import('../main/instruction-settings.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'instruction-package-'));
 try {
  const app=path.join(dir,'app'),data=path.join(dir,'data');
  fs.mkdirSync(path.join(app,'briefs'),{recursive:true});
  fs.writeFileSync(path.join(app,'briefs','worker.md'),'shipped');
  expect(readSystemTemplate(app,data)).toBe('shipped');
  writeInstruction(data,'system','custom');
  expect(readSystemTemplate(app,data)).toBe('custom');
  expect(fs.readFileSync(path.join(app,'briefs','worker.md'),'utf8')).toBe('shipped');
  writeInstruction(data,'system',''); expect(readSystemTemplate(app,data)).toBe('');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
