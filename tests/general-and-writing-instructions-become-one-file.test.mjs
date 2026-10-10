// On 2026-10-07 the instructions page showed two boxes for the same kind of
// user rules, plus three navigation links to sections already on the page.
// Joining the two files must preserve every word, run once, and reach both
// new and resumed agents exactly once. ADHD mode and the app's defaults stay
// independent so toggling the mode never edits the user's instructions.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as instructions from '../main/instruction-settings.mjs';
import {Supervisor} from '../main/supervisor.mjs';
import {bootHeadless} from '../main/serve.mjs';
import {EVERY, sectionsFor} from '../renderer/src/instruction-scope.ts';

const dirs=[];
function folder() {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'joined-instructions-'));dirs.push(dir);return dir;}
function put(dir,file,text) {fs.mkdirSync(path.join(dir,'briefs'),{recursive:true});fs.writeFileSync(path.join(dir,'briefs',file),text);}
const read=(dir,file)=>fs.readFileSync(path.join(dir,'briefs',file),'utf8');
const join=(app,dir)=>instructions.unifyAgentInstructions(app,dir);
afterEach(()=>{vi.restoreAllMocks();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

describe('existing users keep all their instructions',()=>{
 it('appends the writing file without changing either text and keeps originals for recovery',()=>{
  const app=folder(),dir=folder();
  const general='  Check memory first.\n',writing='\nOpen with the answer.  \n';
  put(dir,'founder.md',general);put(dir,'message-rules.md',writing);
  join(app,dir);
  expect(instructions.readInstruction(dir,'rules').text).toBe(`${general}\n\n${writing}`);
  expect(read(dir,'message-rules.md')).toBe(writing);
  expect(instructions.readVersion(dir,'rules',instructions.listVersions(dir,'rules')[0].ts).text).toBe(general);
 });
 it.each(['',null])('keeps writing rules even when the general file is %s',general=>{
  const app=folder(),dir=folder();
  if(general!==null)put(dir,'founder.md',general);
  put(dir,'message-rules.md','Keep it brief.\n');join(app,dir);
  expect(instructions.readInstruction(dir,'rules').text).toBe('Keep it brief.\n');
 });
 it('leaves a fresh install empty and keeps shipped defaults out of the user file',()=>{
  const app=folder(),dir=folder();put(app,'message-rules.md','APP DEFAULTS');
  join(app,dir);
  expect(instructions.readInstruction(dir,'rules').text).toBe('');
  expect(fs.existsSync(path.join(dir,'briefs','founder.md'))).toBe(false);
 });
 it('does not add blank writing rules to the general instructions',()=>{
  const app=folder(),dir=folder();put(dir,'founder.md','Mine.\n');put(dir,'message-rules.md',' \n');join(app,dir);
  expect(read(dir,'founder.md')).toBe('Mine.\n');
 });
 it('does not seed or append the old rules again after the combined box is emptied',()=>{
  const app=folder(),dir=folder();put(app,'message-rules.md','OLD CHECKOUT');put(dir,'message-rules.md','Mine.');
  join(app,dir);instructions.writeInstruction(dir,'rules','');
  instructions.carryHerBriefsAcross(app,dir);instructions.joinMessageRules(app,dir);join(app,dir);
  expect(instructions.readInstruction(dir,'rules').text).toBe('');
 });
 it('retries an interrupted completion without appending twice',()=>{
  const app=folder(),dir=folder();put(dir,'founder.md','General.');put(dir,'message-rules.md','Writing.');
  const rename=fs.renameSync;
  vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{if(to.endsWith('.unified-agent-instructions'))throw new Error('Interrupted');return rename(from,to);});
  join(app,dir);vi.restoreAllMocks();join(app,dir);
  expect(read(dir,'founder.md')).toBe('General.\n\nWriting.');
 });
 it('leaves the legacy rules readable if the combined save fails',()=>{
  const app=folder(),dir=folder();put(dir,'founder.md','General.');put(dir,'message-rules.md','Writing.');
  vi.spyOn(fs,'renameSync').mockImplementation(()=>{throw new Error('Disk unavailable');});join(app,dir);
  expect(read(dir,'founder.md')).toBe('General.');expect(read(dir,'message-rules.md')).toBe('Writing.');
  expect(instructions.agentInstructionsUnified(dir)).toBe(false);
 });
 it('also carries users from the older two writing files into the combined file',()=>{
  const app=folder(),dir=folder();put(dir,'writing-rules.md','During the task.');put(dir,'finishing.md','At the end.');
  instructions.joinMessageRules(app,dir);join(app,dir);
  expect(read(dir,'founder.md')).toBe('During the task.\n\nAt the end.\n');
 });
});

describe('one editor and one injection',()=>{
 it('migrates the browser app before its editors or agents read instructions',async()=>{
  // This checks startup, not filesystem notifications; no real watchers are
  // needed on a Mac running several copies of the suite.
  vi.spyOn(fs,'watch').mockReturnValue({on(){return this;},close(){}});
  const app=folder(),dir=folder();put(dir,'founder.md','Browser general.');put(dir,'message-rules.md','Browser writing.');
  fs.writeFileSync(path.join(dir,'zero.config.json'),JSON.stringify({storeRoot:path.join(dir,'store')}));
  const boot=await bootHeadless({appDir:app,dataDir:dir,userDir:dir});
  try {expect(boot.supervisor.readStanding()).toBe('Browser general.\n\nBrowser writing.');}
  finally {boot.supervisor.stop();boot.store.unwatch();}
 });
 it('routes older editor calls into the combined file after migration',()=>{
  const app=folder(),dir=folder();put(dir,'founder.md','General.');put(dir,'message-rules.md','Writing.');join(app,dir);
  expect(instructions.readInstruction(dir,'messages').text).toBe('General.\n\nWriting.');
  instructions.writeInstruction(dir,'messages','Replacement.');
  expect(instructions.readInstruction(dir,'rules').text).toBe('Replacement.');
  const s=Object.assign(Object.create(Supervisor.prototype),{appDir:app,userDir:dir});
  expect(s.readMessageRules()).toBe('Replacement.');s.writeMessageRules('Another edit.');
  expect(s.readStanding()).toBe('Another edit.');
 });
 it.each([false,true])('passes combined rules once on a run with continuation %s',continuation=>{
  const app=folder(),dir=folder();put(app,'message-rules.md','APP DEFAULTS');put(dir,'founder.md','GENERAL UNIQUE');put(dir,'message-rules.md','WRITING UNIQUE');
  put(dir,'adhd-mode.md','ADHD UNIQUE');join(app,dir);
  const s=Object.assign(Object.create(Supervisor.prototype),{appDir:app,userDir:dir,dataDir:dir,config:{sessionArgs:[],adhdMode:true},buildBrief:()=> 'TASK'});
  const {args}=s.spawnPlan({id:'w-example',product:'sample',title:'Test'},{slug:'sample',name:'Sample',dir:folder(),repoPath:null},{continuation,resumeSessionId:continuation?'session-example':undefined});
  const system=args[args.indexOf('--append-system-prompt')+1];
  for(const text of ['GENERAL UNIQUE','WRITING UNIQUE','APP DEFAULTS','ADHD UNIQUE'])expect(system.split(text)).toHaveLength(2);
  expect(system.indexOf('WRITING UNIQUE')).toBeLessThan(system.indexOf('APP DEFAULTS'));
 });
 it('removes the duplicated section and its navigation while retaining the project switch',()=>{
  expect(sectionsFor(EVERY)).toEqual(['rules','adhd']);expect(sectionsFor('sample')).toEqual(['project']);
  const page=fs.readFileSync(new URL('../renderer/src/components/InstructionSettings.tsx',import.meta.url),'utf8');
  expect(page).not.toContain('instr-toc');expect(page).not.toContain('<SharedPart section={messages}');
  expect(page).toContain('<ScopeSwitch');
 });
});
