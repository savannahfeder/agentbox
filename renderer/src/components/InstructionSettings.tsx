import {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import defaults from '../../../shared/instruction-defaults.json';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { api } from '../api';
import { EVERY, resolveScope, scopeChoices, scopeWords, sectionsFor, startsWriting, type Scope, type SectionId } from '../instruction-scope';
import type { ProjectSettings } from '../types';
type Section = {id:string;label:string;description?:string;defaultText:string};
// The name chosen on w-3dc46f3a67, and it has to be the SAME name here, in
// ⌘K (./Palette) and on the card itself (./Standing). This box said "Your
// rules" while ⌘K said something else, and the cost of that was the box not
// being found at all.
const rules:Section = {id:'rules',label:'General agent instructions',defaultText:''};
// One document since w-3dc46f3a67: the messages during a task and the last one
// of every task were two boxes, and a real instructions file is mostly about
// how agents write to the user anyway.
// ONLY THE USER'S WORDS SINCE w-3ec9f07978. It opened on the app's own message
// rules, which the inbox reads every message by, so editing them broke it.
// Those ride on every run from the checkout now and never sit here.
const messages:Section = {id:'messages',label:'How agents write to you',description:'Your own rules for how agents write to you. They go on top of the app’s built-in rules, which stay out of here because the inbox relies on them.',defaultText:''};
// ADHD MODE (w-5737fe67cf). Its own file so edits to it never mix with the
// user's own rules and are still there next time. Whether it rides at all is a
// workspace setting, which is the switch on its section.
const adhd:Section = {id:'adhd',label:'ADHD mode',defaultText:defaults.adhd};
// OURS, NOT THE USER'S, AND BEHIND A LINE THAT HAS TO BE OPENED. It is the task
// brief every project worker is spawned with. Somebody editing it by accident
// breaks their own inbox with no way to see why.
const system:Section = {id:'system',label:'System prompt',description:`${Name}’s task-brief template for project work. Keep the template placeholders for task context. Personal tasks use your message directly. The coding provider’s own system instructions are managed by that provider.`,defaultText:defaults.system};
const SHARED:Record<Exclude<SectionId,'project'>,Section> = {rules,messages,adhd};
const fixtureText = new Map<string,string>();
const preview = () => new URLSearchParams(location.search).has('fixtures') || !window.zero;
// What every section's writing surface needs, whichever file is under it.
type Writing = {text:string|null;status:string;edit:(v:string)=>void;restore?:{section:Section;defaultText:string;pick:(v:string,label:string)=>void};undo?:{label:string}|null;undoRestore?:()=>void};
// Reading, saving and restoring one of the app's instruction files.
function useInstruction(section: Section): Writing {
 const [text,setText]=useState<string|null>(null);
 const [defaultText,setDefault]=useState(section.defaultText);
 const [status,setStatus]=useState('');
 // A save that failed has to be readable even when a restore has just happened,
 // because the line under the box is the only place either of them is said.
 const [trouble,setTrouble]=useState(false);
 const pending=useRef<string|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const queue=useRef(Promise.resolve());
 const flush=(value:string)=> {
  pending.current=null;
  queue.current=queue.current.then(async()=>{
   try {
    if(preview()) fixtureText.set(section.id,value);
    else {
     if(!window.zero?.instructionWrite) throw new Error(`Reopen ${NAME} to save instructions.`);
     const result=await window.zero.instructionWrite(section.id,value);
     if(!result.ok) throw new Error(result.error || 'Could not save');
    }
    setStatus(preview()?'Saved in this preview':'Saved');setTrouble(false);
   } catch(e) {setStatus(String((e as Error).message));setTrouble(true);}
  });
 };
 useEffect(()=>{
  let active=true;
  if(preview()) {setText(fixtureText.get(section.id) ?? section.defaultText);setStatus('Preview edits stay in this browser session.');}
  else if(!window.zero?.instructionRead) setStatus(`Reopen ${NAME} to edit instructions.`);
  else window.zero.instructionRead(section.id).then(r=>{
   if(!active)return;
   if(r.error) setStatus(r.error); else {setText(r.text);setDefault(r.defaultText);}
  }).catch(e=>setStatus(e.message));
  return ()=>{active=false;if(timer.current)clearTimeout(timer.current);if(pending.current!==null)flush(pending.current);};
 },[section.id]);
 const edit=(value:string)=>{setText(value);pending.current=value;setStatus('Saving…');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>flush(value),400);};
 // PUTTING A VERSION BACK IS AN EDIT, AND IT IS UNDOABLE (w-94b3af4e70).
 const [undo,setUndo]=useState<{text:string;label:string}|null>(null);
 const pick=(value:string,label:string)=>{if(text!==null) setUndo({text,label});edit(value);};
 const undoRestore=()=>{if(!undo)return;edit(undo.text);setUndo(null);};
 return {text,status,edit,restore:{section,defaultText,pick},undo:trouble?null:undo,undoRestore};
}
// A project's own instructions.md. Saved through the settings model, so the
// project page and the spawn read the same file.
function useProjectInstruction(project: ProjectSettings, onSaved: () => void): Writing {
 const [text,setText]=useState(project.instructions);
 const [status,setStatus]=useState('');
 const timer=useRef<number|null>(null);
 const pending=useRef<string|null>(null);
 // Keyed on the SLUG alone, never on the text. A save refreshes the settings
 // model, so a text-keyed reset would overwrite what she typed since.
 const loaded=useRef(project.instructions);
 loaded.current=project.instructions;
 useEffect(()=>{setText(loaded.current);setStatus('');pending.current=null;},[project.slug]);
 const flush=useCallback(async(value:string)=>{
  const r=await api.writeProjectInstructions(project.slug,value);
  if(r.ok){pending.current=null;setStatus('Saved');onSaved();}
  else setStatus(r.error ?? 'Could not save');
 },[project.slug,onSaved]);
 useEffect(()=>()=>{
  if(timer.current) window.clearTimeout(timer.current);
  if(pending.current!==null) void flush(pending.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[project.slug]);
 const edit=(value:string)=>{setText(value);pending.current=value;setStatus('Saving…');if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>void flush(value),400);};
 return {text,status,edit};
}
// One of the user's earlier versions, or ours, written the way a person would
// say it out loud.
export function versionLabel(ts:number,now=Date.now()):string {
 const d=new Date(ts);
 const time=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 const day=(t:number)=>{const x=new Date(t);x.setHours(0,0,0,0);return x.getTime();};
 const days=Math.round((day(now)-day(ts))/86_400_000);
 if(days===0) return `Today at ${time}`;
 if(days===1) return `Yesterday at ${time}`;
 if(days<7) return `${d.toLocaleDateString(undefined,{weekday:'long'})} at ${time}`;
 return `${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})} at ${time}`;
}
export const sizeLabel=(chars:number)=>chars===0 ? 'an empty page' : `${chars.toLocaleString()} characters`;
// A quiet link, closed until pressed, that closes on a click away or Escape.
function useMenu() {
 const [open,setOpen]=useState(false);
 const wrap=useRef<HTMLDivElement|HTMLSpanElement>(null);
 useEffect(()=>{
  if(!open) return;
  const away=(e:MouseEvent)=>{if(!wrap.current?.contains(e.target as Node)) setOpen(false);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}};
  document.addEventListener('mousedown',away);
  document.addEventListener('keydown',key,true);
  return ()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',key,true);};
 },[open]);
 return {open,setOpen,wrap};
}
/* THE LINK OPENS THE USER'S OWN VERSIONS, NOT JUST OURS (w-94b3af4e70). The
   list is the user's recent versions by time, with the original at the bottom. */
function Restore({section,text,defaultText,onPick}:{section:Section;text:string|null;defaultText:string;onPick:(value:string,label:string)=>void}) {
 const {open,setOpen,wrap}=useMenu();
 const [versions,setVersions]=useState<{ts:number;chars:number}[]|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!open) return;
  let active=true;
  setError('');
  if(preview()||!window.zero?.instructionHistory) setVersions([]);
  else window.zero.instructionHistory(section.id).then(r=>{
   if(!active)return;
   if(r.error) setError(r.error);
   setVersions(r.versions ?? []);
  }).catch(e=>{if(active){setError(String(e.message));setVersions([]);}});
  return ()=>{active=false;};
 },[open,section.id]);
 const pick=async(at:number,label:string)=>{
  setOpen(false);
  try {
   if(!window.zero?.instructionVersion) throw new Error(`Reopen ${NAME} to restore a version.`);
   const r=await window.zero.instructionVersion(section.id,at);
   if(r.error) throw new Error(r.error);
   onPick(r.text,label);
  } catch(e) {setError(String((e as Error).message));}
 };
 return <div className="instruction-restore" ref={wrap as React.RefObject<HTMLDivElement>}>
  <button type="button" className="instruction-restore-link" aria-expanded={open} aria-haspopup="menu" disabled={text===null} onClick={()=>setOpen(v=>!v)}>Restore</button>
  {open && <div className="instruction-restore-menu" role="menu" aria-label={`Restore ${section.label}`}>
   {versions===null && <div className="instruction-restore-empty">Looking for earlier versions…</div>}
   {versions?.length===0 && <div className="instruction-restore-empty">No earlier versions of yours yet. One is kept each time you come back to this box.</div>}
   {versions?.map(v=><button key={v.ts} type="button" role="menuitem" onClick={()=>void pick(v.ts,versionLabel(v.ts))}>
    <span>{versionLabel(v.ts)}</span><span className="instruction-restore-size">{sizeLabel(v.chars)}</span>
   </button>)}
   <button type="button" role="menuitem" className="instruction-restore-original" disabled={text===defaultText} onClick={()=>{setOpen(false);onPick(defaultText,'the original');}}>
    <span>The original</span><span className="instruction-restore-size">{sizeLabel(defaultText.length)}</span>
   </button>
   {error && <div className="instruction-restore-empty">{error}</div>}
  </div>}
 </div>;
}
// Whether ADHD mode is on. A workspace setting rather than an instruction file,
// because the supervisor reads it at every spawn. Drawn off what the main
// process answers, never off the click.
function useAdhdMode() {
 const [on,setOn]=useState<boolean|null>(null);
 useEffect(()=>{let active=true;api.settings().then(s=>{if(active&&s.ok) setOn(!!s.workspace.adhdMode);});return ()=>{active=false;};},[]);
 const set=async(v:boolean)=>{const s=await api.setWorkspaceSetting({key:'adhdMode',value:v});if(s.ok) setOn(!!s.workspace.adhdMode);};
 return [on,set] as const;
}
/* ONE SECTION OF THE PAGE: a page you read, and Edit makes it a page you write.
   What she wrote is rendered the way it will read, headings and lists and code
   blocks, because a file of instructions is a document and was being shown as
   a form field. An empty section has nothing to read, so it opens as the
   writing surface with the caret in it. */
function Part({id,label,writing,description,head,hidden}:{id:string;label?:string;writing:Writing;description?:string;head?:React.ReactNode;hidden?:boolean}) {
 const {text,status,edit,restore,undo,undoRestore}=writing;
 const [writingNow,setWriting]=useState(false);
 const decided=useRef(false);
 useEffect(()=>{if(text!==null&&!decided.current){decided.current=true;setWriting(startsWriting(text));}},[text]);
 const box=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{if(writingNow&&text!==null) box.current?.focus({preventScroll:true});},[writingNow]);
 return <section className="instr-part" id={`instr-${id}`}>
  <div className="instr-part-head">
   {label && <h2>{label}</h2>}
   <div className="instr-part-tools">
    {writingNow && restore && <Restore section={restore.section} text={text} defaultText={restore.defaultText} onPick={restore.pick}/>}
    {!hidden && <button type="button" className="instr-edit" aria-pressed={writingNow} disabled={text===null} onClick={()=>setWriting(v=>!v)}>{writingNow?'Done':'Edit'}</button>}
    {head}
   </div>
  </div>
  {description && <p className="instr-part-desc">{description}</p>}
  {!hidden && (writingNow
   ? <>
     <textarea ref={box} aria-label={label ?? 'Instructions'} spellCheck={false} disabled={text===null} value={text ?? ''} onChange={e=>edit(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape') setWriting(false);}} placeholder="Write your instructions here…"/>
     <div className="instruction-save" role="status">{undo ? <>Restored {undo.label.toLowerCase()}. <button type="button" className="instruction-undo" onClick={undoRestore}>Undo</button></> : status}</div>
    </>
   : <div className="instr-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text ?? ''}</ReactMarkdown></div>)}
 </section>;
}
function SharedPart({section}:{section:Section}) {
 const writing=useInstruction(section);
 return <Part id={section.id} label={section.label} writing={writing} description={section.description}/>;
}
function AdhdPart() {
 const writing=useInstruction(adhd);
 const [on,setOn]=useAdhdMode();
 const toggle=on===null ? null : <button type="button" role="switch" aria-checked={on} aria-label="ADHD mode" className={`set-sw ${on ? 'on' : ''}`} onClick={()=>void setOn(!on)}/>;
 return <Part id="adhd" label={adhd.label} writing={writing} head={toggle} hidden={!on}/>;
}
function ProjectPart({project,onSaved}:{project:ProjectSettings;onSaved:()=>void}) {
 const writing=useProjectInstruction(project,onSaved);
 return <Part key={project.slug} id="project" writing={writing}/>;
}
/* THE HEADING IS THE SWITCH (w-4cbcd888ae). "Instructions for every project",
   and the words after "for" open the list of who else it can be for. A dotted
   underline did not read as clickable, so the words carry a solid underline
   and an arrow, which is the one that was approved. */
function ScopeSwitch({scope,projects,onScope}:{scope:Scope;projects:ProjectSettings[];onScope:(s:Scope)=>void}) {
 const {open,setOpen,wrap}=useMenu();
 return <h1 className="instr-lead">Instructions for <span className="instr-scope" ref={wrap as React.RefObject<HTMLSpanElement>}>
  <button type="button" className="instr-scope-word" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   {scopeWords(scope,projects)}
   <svg className="instr-scope-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
  </button>
  {open && <div className="instr-scope-menu" role="menu" aria-label="Instructions for">
   {scopeChoices(projects).map((c,i)=><Fragment key={c.id}>
    {i===1 && <hr/>}
    <button type="button" role="menuitemradio" aria-checked={c.id===scope} onClick={()=>{setOpen(false);onScope(c.id);}}>{c.label}</button>
   </Fragment>)}
  </div>}
 </span></h1>;
}
/* ONE PAGE (w-4cbcd888ae, 2026-10-01). Picked from three drawn in the real
   app. Who it is for is the heading. On every project the three shared
   sections sit in one card in the order an agent reads them, with a short list
   on the left that jumps to each. On a project the card holds that project's
   own file and nothing else, at the same left edge so switching does not jump.
   The task brief is ours, behind Advanced, where it always was. */
export function InstructionSettings({projects=[],scope:asked=EVERY,onScope,onSaved=()=>{}}:{projects?:ProjectSettings[];scope?:Scope;onScope?:(s:Scope)=>void;onSaved?:()=>void}){
 const [own,setOwn]=useState<Scope>(asked);
 useEffect(()=>setOwn(asked),[asked]);
 const scope=resolveScope(own,projects);
 const pick=(s:Scope)=>{setOwn(s);onScope?.(s);};
 const project=projects.find(p=>p.slug===scope);
 const ids=sectionsFor(scope);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const jump=(id:string)=>document.getElementById(`instr-${id}`)?.scrollIntoView({block:'start',behavior:'smooth'});
 return <div className="set-inner instructions-page">
  <ScopeSwitch scope={scope} projects={projects} onScope={pick}/>
  <div className="instr-body">
   <nav className="instr-toc" aria-label="Sections">{scope===EVERY && ids.map(id=><button key={id} type="button" onClick={()=>jump(id)}>{SHARED[id as keyof typeof SHARED].label}</button>)}</nav>
   <div>
    <div className="instr-card">
     {scope===EVERY
      ? <><SharedPart section={rules}/><SharedPart section={messages}/><AdhdPart/></>
      : project && <ProjectPart project={project} onSaved={onSaved}/>}
    </div>
    {scope===EVERY && <div className="instruction-advanced">
     <button className="instruction-advanced-toggle" aria-expanded={showAdvanced} onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'Hide advanced':'Advanced'}</button>
     {showAdvanced && <div className="instr-card instr-card-ours"><SharedPart section={system}/></div>}
    </div>}
   </div>
  </div>
 </div>;
}
