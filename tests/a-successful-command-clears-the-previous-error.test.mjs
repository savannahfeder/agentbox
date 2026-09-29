// 2026-09-16: real browser test ran project-proof successfully, then reopening
// its task resurrected one old unsupported-command error. Persist the latest
// dispatch result so reopening cannot turn a successful send into a failure.
import {it,expect,vi} from 'vitest';
import {taskCommand} from '../main/task-commands.mjs';
function fixture(engine='claude') {
 return {store:{readItem:()=>({id:'one',product:'p'})},_engineFor:()=>engine,
 _nativeCommands:{one:['project-proof','code-review']},_compactions:{},
 _saveState:vi.fn(),onChange:vi.fn()};
}
it.each([['claude','/project-proof args'],['claude','/reload-skills'],['claude','/review'],['codex','/review --base main']])('persists forwarding for %s %s',async(engine,command)=>{
 const sup=fixture(engine),key=JSON.stringify(['p','one']);
 await taskCommand(sup,'p','one','/not-supported');
 expect(sup._compactions[key].state).toBe('failed');
 const result=await taskCommand(sup,'p','one',command);
 expect(result.state).toBe('forward');
 expect(sup._compactions[key]).toEqual(result);
 expect(sup._saveState).toHaveBeenCalledTimes(2);
});
it('keeps a new genuine refusal and does not change another task',async()=>{
 const sup=fixture('codex');sup._compactions.other={state:'failed',text:'other error'};
 await taskCommand(sup,'p','one','/review --base');
 expect(sup._compactions[JSON.stringify(['p','one'])].state).toBe('failed');
 expect(sup._compactions.other).toEqual({state:'failed',text:'other error'});
});

import fs from 'node:fs';
import ts from 'typescript';
import {providerCommand,reviewTarget} from '../shared/provider-commands.mjs';
// Exercise the actual composer send function, with only its UI/IPC boundaries
// replaced. Built-in Claude commands and Codex review used to bypass dispatch.
it.each([['claude','/reload-skills'],['codex','/review --base main'],['claude','/project-proof']])('the composer dispatches %s %s before forwarding',async(runningEngine,text)=>{
 const source=fs.readFileSync(new URL('../renderer/src/components/Focus.tsx',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const send = async (spoken?: string) => {'),source.indexOf('  const hasDraft =',source.indexOf('  const send = async (spoken?: string) => {')));
 const runCommand=vi.fn(async()=>({state:'forward'})),onSend=vi.fn();
 const context={text,runningEngine,item:{id:'one',product:'p'},attachments:[],ref:{current:{value:text}},providerCommand,reviewTarget,codexCommand:()=>null,runCommand,onSend,onNotice:vi.fn(),clearDraft:vi.fn(),setText:vi.fn(),persistAttachments:async()=>'',prio:null,repeat:null,mode:null,
 // The reply box's model drawer. `touched` false is the box nobody opened,
 // which must send no model at all and leave the row's own.
 touched:false,model:null,effort:null};
 const js=ts.transpile(body+'\nreturn send;', {target:ts.ScriptTarget.ES2022});
 const send=new Function(...Object.keys(context),js)(...Object.values(context));
 await send();
 expect(runCommand).toHaveBeenCalledWith({product:'p',id:'one'},text);
 expect(onSend).toHaveBeenCalledWith(text,undefined,null,{words:text,attachments:[]},null,undefined);
});
