import {useEffect, useRef, useState} from 'react';
import defaults from '../../../shared/instruction-defaults.json';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { api } from '../api';
const sections = [
 // The name chosen on w-3dc46f3a67, and it has to be the SAME name here, in
 // ⌘K (./Palette) and on the card itself (./Standing). This box said "Your
 // rules" while ⌘K said something else, and the cost of that was the box not
 // being found at all.
 {id:'rules',label:'General agent instructions',description:'Your instructions for every agent, on every project. The default is an empty page.',defaultText:''},
 // TWO BOXES BECAME THIS ONE (w-3dc46f3a67, 2026-09-22). "How agents write to
 // you" shaped the messages during a task and "How every task ends" shaped the
 // last one. Five adjustable layers of prompts were too many. Nobody sitting
 // down to write rules divides them that way: a real instructions file is
 // mostly about how agents write to the user rather than what they do.
 {id:'messages',label:'How agents write to you',description:'The titles, opening lines and questions you receive, and the last message of every task. Empty the box and agents follow none of it.',defaultText:defaults.messages},
];
// OURS, NOT THE USER'S, AND BEHIND A LINE THAT HAS TO BE OPENED. It is the task brief every
// project worker is spawned with. Somebody editing it by accident breaks their
// own inbox with no way to see why, which is not a thing a page should offer at
// the same weight as the two boxes above.
const advanced = [
 {id:'system',label:'System prompt',description:`${Name}’s task-brief template for project work. Keep the template placeholders for task context. Personal tasks use your message directly. The coding provider’s own system instructions are managed by that provider.`,defaultText:defaults.system},
];
// ADHD MODE (w-5737fe67cf, 2026-09-25). Not a tab: a switch on the "How agents
// write to you" card, and while it is on, its rules in their own box under the
// user's. Turning it on appends that text to the user's instructions and
// turning it off removes it, shown as a separate section of additional
// instructions. Its own box so edits to it never mix with the user's own rules
// and are still there next time.
const adhd = {id:'adhd',label:'ADHD mode',description:'',defaultText:defaults.adhd};
const fixtureText = new Map<string,string>();
const preview = () => new URLSearchParams(location.search).has('fixtures') || !window.zero;
// Reading, saving and resetting one instruction file. Shared by the card and by
// the ADHD box inside it, so both save the same way and say so the same way.
function useInstruction(section: typeof sections[number]) {
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
 // It saves through the same path as typing, so the text she is leaving becomes
 // a restore point of its own, and the line under the box keeps the one step
 // back for as long as the page is open.
 const [undo,setUndo]=useState<{text:string;label:string}|null>(null);
 const restore=(value:string,label:string)=>{if(text!==null) setUndo({text,label});edit(value);};
 const undoRestore=()=>{if(!undo)return;edit(undo.text);setUndo(null);};
 return {text,defaultText,status,edit,restore,undo:trouble?null:undo,undoRestore};
}
// One of the user's earlier versions, or ours. The times are the user's, so they
// are written the way a person would say them out loud: today at a time, yesterday at a time, and
// a date once it is older than that.
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
/* THE LINK OPENS THE USER'S OWN VERSIONS, NOT JUST OURS (w-94b3af4e70).
   Design C was picked for its surface: a quiet link in the corner instead of a
   button in the way. What the link does is the half that had to change. A user
   who edits the agent instructions can lose something important and want the
   version that worked better before. Our shipped text cannot answer that, so
   the list is the user's recent versions by time, with the original at the
   bottom of it. */
function Restore({section,text,defaultText,onPick}:{section:{id:string;label:string};text:string|null;defaultText:string;onPick:(value:string,label:string)=>void}) {
 const [open,setOpen]=useState(false);
 const [versions,setVersions]=useState<{ts:number;chars:number}[]|null>(null);
 const [error,setError]=useState('');
 const wrap=useRef<HTMLDivElement>(null);
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
  const away=(e:MouseEvent)=>{if(!wrap.current?.contains(e.target as Node)) setOpen(false);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}};
  document.addEventListener('mousedown',away);
  document.addEventListener('keydown',key,true);
  return ()=>{active=false;document.removeEventListener('mousedown',away);document.removeEventListener('keydown',key,true);};
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
 return <div className="instruction-restore" ref={wrap}>
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
// Whether ADHD mode is on. It is a workspace setting rather than an instruction
// file, because the supervisor reads it at every spawn to decide whether the box
// rides at all. Drawn off what the main process answers, never off the click.
function useAdhdMode() {
 const [on,setOn]=useState<boolean|null>(null);
 useEffect(()=>{let active=true;api.settings().then(s=>{if(active&&s.ok) setOn(!!s.workspace.adhdMode);});return ()=>{active=false;};},[]);
 const set=async(v:boolean)=>{const s=await api.setWorkspaceSetting({key:'adhdMode',value:v});if(s.ok) setOn(!!s.workspace.adhdMode);};
 return [on,set] as const;
}
function Editor({section}: {section: typeof sections[number]}) {
 const {text,defaultText,status,edit,restore,undo,undoRestore}=useInstruction(section);
 const withAdhd=section.id==='messages';
 const [adhdOn,setAdhd]=useAdhdMode();
 /* THE PAGE SHOWS THAT IT IS WRITABLE, IT DOES NOT SAY SO (w-3dc46f3a67).
    On all three shapes it was unclear the text could be edited, and the rule
    is to show that visually, never to explain UX with text.

    So the line that sat under the text, the one about saving while typing and
    applying to the next session, is gone, and so is the page's lede. (Neither
    string is repeated here: a test reads this file for them.) What replaced them
    is the surface: a quiet writing panel that is there at rest, deepens under
    the pointer, and takes an accent down its left edge when it has focus
    (../workspace-navigation.css). The caret is in it the moment the page opens,
    which is the one thing a page of rendered text never has.

    The status line stays for what is NOT an explanation: saving, saved, and the
    errors a person can act on. It is empty the rest of the time. */
 const box=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{if(text!==null) box.current?.focus({preventScroll:true});},[text!==null]);
 return <div className="instruction-editor">
  <div className="instruction-editor-head"><h2>{section.label}</h2><Restore section={section} text={text} defaultText={defaultText} onPick={restore}/></div>
  <p>{section.description}</p>
  {/* ONE RIGHT EDGE FOR THE WHOLE CARD (w-5737fe67cf). On the drawing the
      components were not right-aligned. The switch, both Reset buttons
      and both writing boxes end where the card's padding ends. */}
  {withAdhd && adhdOn!==null && <div className="instruction-toggle">
   <div><div className="instruction-toggle-label">ADHD mode</div><div className="instruction-toggle-desc">Adds a short set of rules under yours.</div></div>
   <button type="button" role="switch" aria-checked={adhdOn} aria-label="ADHD mode" className={`set-sw ${adhdOn ? 'on' : ''}`} onClick={()=>void setAdhd(!adhdOn)}/>
  </div>}
  <textarea ref={box} aria-label={section.label} spellCheck={false} disabled={text===null} value={text ?? ''} onChange={e=>edit(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Write your instructions here…"/>
  <div className="instruction-save" role="status">{undo ? <>Restored {undo.label.toLowerCase()}. <button type="button" className="instruction-undo" onClick={undoRestore}>Undo</button></> : status}</div>
  {withAdhd && adhdOn && <AdhdBox/>}
 </div>;
}
// The ADHD rules, under the user's, while the mode is on. Same box, same saving, same
// Reset as the card above it, one size down so it reads as part of that card.
function AdhdBox() {
 const {text,defaultText,status,edit,restore,undo,undoRestore}=useInstruction(adhd);
 return <div className="instruction-sub">
  <div className="instruction-editor-head"><h3>{adhd.label}</h3><Restore section={adhd} text={text} defaultText={defaultText} onPick={restore}/></div>
  <textarea aria-label={adhd.label} spellCheck={false} disabled={text===null} value={text ?? ''} onChange={e=>edit(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Write your instructions here…"/>
  <div className="instruction-save" role="status">{undo ? <>Restored {undo.label.toLowerCase()}. <button type="button" className="instruction-undo" onClick={undoRestore}>Undo</button></> : status}</div>
 </div>;
}
/* THE SECTION SITS IN A CARD, AND THAT IS SETTLED (w-3dc46f3a67, 2026-09-23).

   Three shapes were drawn in the real app for that round and the card was
   approved. The other two are gone along with the `?shape=` switch that drew them:
   a document with nothing around the words, and a list of rows that opened a
   writing screen. Both are in this file's history at 8f8d04eb and written up in
   decisions.md. Nothing here is switchable any more, because a page that can
   still be flipped is a page that has to be decided about twice.

   What the card has to keep doing, which is why it was picked: it holds one
   section together and separates it from the page, the way a task reads in the
   inbox, and the writing surface inside it sits DEEPER than the card so the
   place to type is still the obvious thing on the screen
   (../workspace-navigation.css). */
export function InstructionSettings(){
 const [selected,setSelected]=useState(sections[0]);
 // Shut every time the page opens, on purpose. The one thing behind it is ours,
 // and a disclosure that remembers being open is a disclosure that stops being
 // one.
 const [showAdvanced,setShowAdvanced]=useState(false);

 // NO LEDE. The line that used to sit here said the sections could be
 // edited and reset, which is the page explaining itself in words and the thing
 // ruled out above. The writing surface and the Reset button each say their own
 // half without it.
 return <div className="set-inner instructions-page">
 <div className="instruction-tabs" aria-label="Instruction sections">{sections.map(section=><button key={section.id} aria-pressed={section.id===selected.id} onClick={()=>setSelected(section)}>{section.label}</button>)}</div>
 <Editor key={selected.id} section={selected}/>
 <div className="instruction-advanced">
  <button className="instruction-advanced-toggle" aria-expanded={showAdvanced} onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'Hide advanced':'Advanced'}</button>
  {showAdvanced && advanced.map(section=><Editor key={section.id} section={section}/>)}
 </div></div>;
}
