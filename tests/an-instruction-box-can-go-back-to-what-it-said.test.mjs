// w-94b3af4e70: the Instructions page could only hand back OUR text. A user
// who edits the agent instructions can lose something critical, notice the app
// worked better before, and need a way to restore the earlier version.
//
// So a save keeps what it replaced. What is measured here is the three things
// that decide whether that is worth anything: the old text comes back word for
// word, a burst of typing leaves ONE restore point rather than one per
// keystroke, and the list never grows without limit.
import {expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readInstruction,writeInstruction,listVersions,readVersion} from '../main/instruction-settings.mjs';

const QUIET=10*60*1000;
const FILES={rules:'founder.md',messages:'message-rules.md'};
const box=()=>fs.mkdtempSync(path.join(os.tmpdir(),'instruction-history-'));
// A save at a stated moment. The clock the code reads is the file's own
// modified time, so the fake one has to be written onto the file as well, which
// is the only way to play a week of edits inside a test.
function saveAt(dir,id,text,at) {
 writeInstruction(dir,id,text,at);
 const file=path.join(dir,'briefs',FILES[id]);
 fs.utimesSync(file,new Date(at),new Date(at));
}

it('gives back the paragraph a save deleted',()=>{
 const dir=box();
 try {
  const hers='Her rules.\n\nThe paragraph that matters.\n';
  const noon=Date.UTC(2026,8,25,12,0,0);
  saveAt(dir,'rules',hers,noon);
  saveAt(dir,'rules','Her rules.\n',noon+QUIET+1000);
  expect(readInstruction(dir,'rules').text).toBe('Her rules.\n');
  const versions=listVersions(dir,'rules');
  expect(versions.length).toBe(1);
  expect(versions[0].ts).toBe(noon);
  expect(versions[0].chars).toBe(hers.length);
  expect(readVersion(dir,'rules',versions[0].ts).text).toBe(hers);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('keeps one restore point for a burst of typing, not one per keystroke',()=>{
 const dir=box();
 try {
  const noon=Date.UTC(2026,8,25,12,0,0);
  saveAt(dir,'messages','settled text',noon);
  // Twenty saves 400ms apart, the way the box saves while she types.
  const start=noon+QUIET+1000;
  for(let i=0;i<20;i++) saveAt(dir,'messages',`typing ${i}`,start+i*400);
  const versions=listVersions(dir,'messages');
  expect(versions.length).toBe(1);
  expect(readVersion(dir,'messages',versions[0].ts).text).toBe('settled text');
  expect(readInstruction(dir,'messages').text).toBe('typing 19');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('holds twenty versions and drops the oldest',()=>{
 const dir=box();
 try {
  const first=Date.UTC(2026,8,1,9,0,0);
  for(let i=0;i<30;i++) saveAt(dir,'rules',`version ${i}`,first+i*(QUIET+1000));
  const versions=listVersions(dir,'rules');
  expect(versions.length).toBe(20);
  expect(readVersion(dir,'rules',versions[0].ts).text).toBe('version 28');
  expect(readVersion(dir,'rules',versions.at(-1).ts).text).toBe('version 9');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

it('has no versions before the first save, and never reads outside its own folder',()=>{
 const dir=box();
 try {
  expect(listVersions(dir,'rules')).toEqual([]);
  expect(()=>listVersions(dir,'../anything')).toThrow();
  expect(()=>readVersion(dir,'rules','../../etc/passwd')).toThrow();
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
