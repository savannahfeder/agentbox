import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {api} from '../api';
import {commandRunning} from '../../../shared/terminal-state.mjs';
import {CrossIcon} from './CrossIcon';
import '@xterm/xterm/css/xterm.css';
import './task-terminal.css';
const screenCache=new Map<string,{token:string;screen:string;offset:number;cols:number;rows:number}>();
const views=new Map<string,{open:boolean;placement:'bottom'|'side'}>();
export function TaskTerminal({product,id,headerTarget,startOpen=false,commandSession=false}:{product:string;id:string;headerTarget?:HTMLElement|null;commandSession?:boolean;
  /**
   * OPEN WITHOUT BEING ASKED, for the one caller that IS the terminal rather
   * than a task that happens to have one: the Codex sign in on Settings. A
   * task's terminal stays shut until she opens it, which is why this defaults
   * to false and nothing else passes it. */
  startOpen?:boolean}){
  const key=JSON.stringify({product,id});
  const saved=views.get(key);
  const [open,setOpen]=useState(saved?.open??startOpen);
  const [placement,setPlacement]=useState<'bottom'|'side'>(saved?.placement??'bottom');
  const [error,setError]=useState('');const [cwd,setCwd]=useState('');
  const [exited,setExited]=useState(false);const [processName,setProcessName]=useState('Shell');
  const [revision,setRevision]=useState(0);const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{views.set(key,{open,placement});},[key,open,placement]);
  // ⌘K's "Open Terminal" row opens it; ⌘J is a switch, the way ⌘J is a switch
  // in every editor she already uses. The two events stay separate because a
  // menu row named "Open Terminal" that closed an open terminal would be
  // lying.
  useEffect(()=>{
    const show=()=>setOpen(true);
    const flip=()=>setOpen(v=>!v);
    window.addEventListener('task-terminal-open',show);
    window.addEventListener('task-terminal-toggle',flip);
    return ()=>{window.removeEventListener('task-terminal-open',show);window.removeEventListener('task-terminal-toggle',flip);};
  },[]);
  useEffect(()=>{
    if(!open||!host.current)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    let dispose=()=>{};
    setError('');setExited(false);
    void (async()=>{
      try{
        const [{Terminal},{FitAddon},{SerializeAddon}]=await Promise.all([import('@xterm/xterm'),import('@xterm/addon-fit'),import('@xterm/addon-serialize')]);
        if(cancelled||!host.current)return;
        const style=getComputedStyle(host.current);
        const terminal=new Terminal({cursorBlink:true,screenReaderMode:true,allowTransparency:true,fontFamily:'Menlo, Monaco, monospace',fontSize:12,scrollback:5000,allowProposedApi:false,theme:{background:'#00000000',foreground:style.color},convertEol:false});
        const fit=new FitAddon();const serializer=new SerializeAddon();terminal.loadAddon(serializer);terminal.loadAddon(fit);terminal.open(host.current);
        let offset=0,ready=false,token='',input=Promise.resolve();
        const report=(e:unknown)=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));};
        const resize=()=>{if(!ready||cancelled||!host.current?.clientWidth||!host.current?.clientHeight)return;fit.fit();if(ready)void api.terminal({product,id,action:'resize',cols:Math.max(2,Math.min(500,terminal.cols)),rows:Math.max(2,Math.min(300,terminal.rows))}).catch(report);};
        const observer=new ResizeObserver(resize);observer.observe(host.current);
        const subscription=terminal.onData(data=>{input=input.then(async()=>{for(let i=0;i<data.length;i+=16384)await api.terminal({product,id,action:'write',data:data.slice(i,i+16384)});}).catch(report);});
        dispose=()=>{if(ready)screenCache.set(key,{token,screen:serializer.serialize({scrollback:1000}),offset,cols:terminal.cols,rows:terminal.rows});observer.disconnect();subscription.dispose();terminal.dispose();};
        const consume=async(state:any)=>{if(cancelled)return;setCwd(state.cwd);setProcessName(state.process);setExited(state.exited);if(state.truncated){terminal.reset();terminal.writeln('[Earlier terminal output omitted]');}await new Promise<void>(resolve=>terminal.write(state.data,resolve));offset=state.offset;};
        let initial=await api.terminal({product,id,action:'open'});
        if(cancelled)return;
        token=initial.token;const cached=screenCache.get(key);
        if(cached?.token===token){terminal.resize(cached.cols,cached.rows);await new Promise<void>(resolve=>terminal.write(cached.screen,resolve));initial=await api.terminal({product,id,action:'read',offset:cached.offset});}
        await consume(initial);ready=true;resize();terminal.focus();
        const poll=async()=>{try{const state=await api.terminal({product,id,action:'read',offset});await consume(state);if(!cancelled)timer=setTimeout(poll,150);}catch(e){report(e);}};
        timer=setTimeout(poll,150);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:String(e));}
    })();
    return ()=>{cancelled=true;if(timer)clearTimeout(timer);dispose();};
  },[open,product,id,revision]);
  async function end(){try{await api.terminal({product,id,action:'close'});views.set(key,{open:false,placement});setExited(true);setProcessName('Ended');setOpen(false);}catch(e){setError(String(e));}}
  async function restart(){try{await api.terminal({product,id,action:'close'});setRevision(v=>v+1);}catch(e){setError(String(e));}}
  const toggle=<button className={`icon-btn terminal-header-control${open?' on':''}`} data-hint="terminal" data-hint-align="right" title={open?'Hide terminal':'Open terminal'} aria-label={open?'Hide terminal':'Open terminal'} aria-expanded={open} onClick={()=>setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/></svg></button>;
  return <>{headerTarget&&createPortal(toggle,headerTarget)}{open&&<section className={`task-terminal task-terminal-${placement}`} aria-label="Task terminal">
    <TerminalToolbar cwd={cwd} processName={processName} exited={exited} placement={placement}
      onStop={()=>void api.terminal({product,id,action:'write',data:'\x03'}).catch(e=>setError(String(e)))}
      onEnd={()=>void end()}
      onPlacement={()=>setPlacement(placement==='bottom'?'side':'bottom')}
      onHide={()=>setOpen(false)}/>
    {error&&<div className="task-terminal-message" role="alert">{error} <button onClick={()=>setRevision(v=>v+1)}>Retry</button></div>}
    <div className="task-terminal-screen" ref={host}/>
    {exited&&<div className="task-terminal-message">{commandSession?'Command exited.':<>Shell exited. <button onClick={()=>void restart()}>New session</button></>}</div>}
    {/* The name was the one live word in it, read from shared/product-name.mjs; there is
       nothing left here to read it into.
     */}
  </section>}</>;
}

// THE CORNER, AND EVERY CONTROL IN IT ON ONE LINE.
//
// It was four controls of three different kinds sharing one flex row: two text
// buttons, one inline `<svg width="16">`, and a `×` typed as a character at
// `font:20px/1 sans-serif`. `align-items:center` centres each BUTTON, and the
// buttons were different heights because an inline svg sits on the text
// baseline and leaves the descender space under it inside the box, while a
// 20px glyph in a 12px row makes a box taller again. So the boxes lined up and
// the marks inside them did not, which is what she photographed.
//
// The fix is one box size for every control in the row and the mark centred
// inside it, which is `.icon-btn`'s recipe everywhere else in this app: a fixed
// square, `display:grid;place-items:center`, and the svg as a block. The `×` is
// now `CrossIcon`, the app's own cross, so it is the same kind of thing as the
// control beside it rather than a letter pretending to be one.
//
// It is exported for scripts/measure-terminal-toolbar-alignment.mjs, which
// mounts this exact component and reads the centre of every mark in it.
export function TerminalToolbar({cwd,processName,exited,placement,onStop,onEnd,onPlacement,onHide}:{
  cwd:string;processName:string;exited:boolean;placement:'bottom'|'side';
  onStop:()=>void;onEnd:()=>void;onPlacement:()=>void;onHide:()=>void;
}){
  const running=commandRunning(processName,exited);
  return <header className="task-terminal-toolbar">
    <strong>Terminal</strong>
    <span className="task-terminal-folder" title={cwd}>{cwd.split('/').filter(Boolean).pop()||'Opening…'}</span>
    <span className="task-terminal-controls">
      <span className="task-terminal-process">{processName}</span>
      {/* ONE NAMES A COMMAND AND ONE NAMES THE SHELL, and only one of them is
          usually on screen. See ../../../shared/terminal-state.mjs for her report and the rule. */}
      {running&&<button className="task-terminal-word" title={`Stop ${processName} (Ctrl+C). The shell stays open.`} onClick={onStop}>Stop command</button>}
      <button className="task-terminal-word" title="End this shell and everything it started. The terminal closes." onClick={onEnd}>End shell</button>
      <button className="task-terminal-icon" aria-label={placement==='bottom'?'Move terminal to side':'Move terminal to bottom'} title={placement==='bottom'?'Move to side':'Move to bottom'} onClick={onPlacement}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/>{placement==='bottom'?<path d="M12 3v14"/>:<path d="M2 12h16"/>}</svg>
      </button>
      <button className="task-terminal-icon task-terminal-hide" aria-label="Hide terminal panel" title="Hide the terminal. The shell keeps running." onClick={onHide}><CrossIcon/></button>
    </span>
  </header>;
}
