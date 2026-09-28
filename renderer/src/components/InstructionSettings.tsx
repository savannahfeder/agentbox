import {useEffect, useRef, useState} from 'react';
import defaults from '../../../shared/instruction-defaults.json';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { api } from '../api';
const sections = [
 // Her name for it, chosen on w-3dc46f3a67 (2026-09-21), and it has to be the
 // SAME name here, in ⌘K (./Palette) and on the card itself (./Standing). This
 // box said "Your rules" while ⌘K said something else, and the cost of that was
 // her not finding the box at all.
 {id:'rules',label:'General agent instructions',description:'Your instructions for every agent, on every project. The default is an empty page.',defaultText:''},
 // TWO BOXES BECAME THIS ONE (w-3dc46f3a67, 2026-09-22). "How agents write to
 // you" shaped the messages during a task and "How every task ends" shaped the
 // last one. Hers: "Those five layers of prompts that the user can adjust might
 // be overkill." Nobody sitting down to write rules divides them that way, and
 // her own instructions file proves it: three of its four paragraphs are about
 // how agents write to her rather than what they do.
 {id:'messages',label:'How agents write to you',description:'The titles, opening lines and questions you receive, and the last message of every task. Empty the box and agents follow none of it.',defaultText:defaults.messages},
];
// OURS, NOT HERS, AND BEHIND A LINE SHE HAS TO OPEN. It is the task brief every
// project worker is spawned with. Somebody editing it by accident breaks their
// own inbox with no way to see why, which is not a thing a page should offer at
// the same weight as the two boxes above.
const advanced = [
 {id:'system',label:'System prompt',description:`${Name}’s task-brief template for project work. Keep the template placeholders for task context. Personal tasks use your message directly. The coding provider’s own system instructions are managed by that provider.`,defaultText:defaults.system},
];
// ADHD MODE (w-5737fe67cf, 2026-09-25). Not a tab: a switch on the "How agents
// write to you" card, and while it is on, its rules in their own box under hers.
// Hers: "it should really just append that text to your content if you have
// ADHD mode on, and then remove it when you turn it off... Maybe it opens a new
// section with additional instructions that get applied." Its own box so her
// edits to it never mix with her own rules and are still there next time.
const adhd = {id:'adhd',label:'ADHD mode',description:'',defaultText:defaults.adhd};
const fixtureText = new Map<string,string>();
const preview = () => new URLSearchParams(location.search).has('fixtures') || !window.zero;
// Reading, saving and resetting one instruction file. Shared by the card and by
// the ADHD box inside it, so both save the same way and say so the same way.
function useInstruction(section: typeof sections[number]) {
 const [text,setText]=useState<string|null>(null);
 const [defaultText,setDefault]=useState(section.defaultText);
 const [status,setStatus]=useState('');
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
    setStatus(preview()?'Saved in this preview':'Saved');
   } catch(e) {setStatus(String((e as Error).message));}
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
 return {text,defaultText,status,edit};
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
 const {text,defaultText,status,edit}=useInstruction(section);
 const withAdhd=section.id==='messages';
 const [adhdOn,setAdhd]=useAdhdMode();
 /* THE PAGE SHOWS THAT IT IS WRITABLE, IT DOES NOT SAY SO (w-3dc46f3a67,
    2026-09-23). Hers, on the three shapes: "it's unclear I can edit it (and we
    should show that visually, not with text explaining it - never explain UX
    with text)."

    So the line that sat under the text, the one about saving as she typed and
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
  <div className="instruction-editor-head"><h2>{section.label}</h2><button disabled={text===null || text===defaultText} onClick={()=>edit(defaultText)}>Reset to default</button></div>
  <p>{section.description}</p>
  {/* ONE RIGHT EDGE FOR THE WHOLE CARD (w-5737fe67cf). Hers, on the drawing:
      "these components are not right-aligned." The switch, both Reset buttons
      and both writing boxes end where the card's padding ends. */}
  {withAdhd && adhdOn!==null && <div className="instruction-toggle">
   <div><div className="instruction-toggle-label">ADHD mode</div><div className="instruction-toggle-desc">Adds a short set of rules under yours.</div></div>
   <button type="button" role="switch" aria-checked={adhdOn} aria-label="ADHD mode" className={`set-sw ${adhdOn ? 'on' : ''}`} onClick={()=>void setAdhd(!adhdOn)}/>
  </div>}
  <textarea ref={box} aria-label={section.label} spellCheck={false} disabled={text===null} value={text ?? ''} onChange={e=>edit(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Write your instructions here…"/>
  <div className="instruction-save" role="status">{status}</div>
  {withAdhd && adhdOn && <AdhdBox/>}
 </div>;
}
// The ADHD rules, under hers, while the mode is on. Same box, same saving, same
// Reset as the card above it, one size down so it reads as part of that card.
function AdhdBox() {
 const {text,defaultText,status,edit}=useInstruction(adhd);
 return <div className="instruction-sub">
  <div className="instruction-editor-head"><h3>{adhd.label}</h3><button disabled={text===null || text===defaultText} onClick={()=>edit(defaultText)}>Reset to default</button></div>
  <textarea aria-label={adhd.label} spellCheck={false} disabled={text===null} value={text ?? ''} onChange={e=>edit(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="Write your instructions here…"/>
  <div className="instruction-save" role="status">{status}</div>
 </div>;
}
/* THE SECTION SITS IN A CARD, AND THAT IS SETTLED (w-3dc46f3a67, 2026-09-23).
   Her words: "approved 2. Card".

   Three shapes were drawn in the real app for that round and she chose between
   them. The other two are gone along with the `?shape=` switch that drew them:
   a document with nothing around the words, and a list of rows that opened a
   writing screen. Both are in this file's history at 8f8d04eb and written up in
   decisions.md. Nothing here is switchable any more, because a page that can
   still be flipped is a page she has to decide about twice.

   What the card has to keep doing, which is why she picked it: it holds one
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

 // NO LEDE. The line that used to sit here told her the sections could be
 // edited and reset, which is the page explaining itself in words and the thing
 // she ruled out. The writing surface and the Reset button each say their own
 // half without it.
 return <div className="set-inner instructions-page">
 <div className="instruction-tabs" aria-label="Instruction sections">{sections.map(section=><button key={section.id} aria-pressed={section.id===selected.id} onClick={()=>setSelected(section)}>{section.label}</button>)}</div>
 <Editor key={selected.id} section={selected}/>
 <div className="instruction-advanced">
  <button className="instruction-advanced-toggle" aria-expanded={showAdvanced} onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'Hide advanced':'Advanced'}</button>
  {showAdvanced && advanced.map(section=><Editor key={section.id} section={section}/>)}
 </div></div>;
}
