import {useEffect,useRef} from 'react';
import {api} from '../api';
import {setupLive,type LiveControl} from '../live/live.js';
import type {DesktopLiveAction} from '../../../shared/desktop-live-actions.mjs';
const el=(tag:string,props:Record<string,any>={},...children:any[])=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='class')n.className=v;else n.setAttribute(k,v)}for(const c of children.flat())if(c!=null)n.append(typeof c==='string'?document.createTextNode(c):c);return n};
export function DesktopLive({execute,context,onNotice}:{execute:(action:DesktopLiveAction)=>Promise<any>;context:unknown;onNotice:(text:string)=>void}){
 const mount=useRef<HTMLDivElement>(null),control=useRef<LiveControl>();const current=useRef({execute,onNotice});current.current={execute,onNotice};
 useEffect(()=>{control.current=setupLive({el,mount:mount.current!,api:(_path,data)=>api.desktopLive(data),execute:a=>current.current.execute(a),toast:t=>current.current.onNotice(t),available:()=>true,recording:()=>false});return()=>control.current?.destroy()},[]);
 useEffect(()=>{control.current?.context(context)},[JSON.stringify(context)]);
 return <div className="desktop-live-launch" ref={mount}/>;
}
