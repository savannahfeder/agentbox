import {useEffect,useState} from 'react';
import {api} from '../api';
import {Name} from '../../../shared/product-name.mjs';
import './remote-control.css';
type State={state:string;at:number;text?:string;url?:string;mayBeActive?:boolean};
export function RemoteControl({product,id}:{product:string;id:string}) {
 const [value,setValue]=useState<State|null>(null);
 const [busy,setBusy]=useState(false);
 const task={product,id};
 useEffect(()=>{let gone=false;const refresh=()=>api.remoteControl({product,id,action:'status'}).then(v=>{if(!gone)setValue(v);}).catch(()=>{});void refresh();const timer=setInterval(refresh,1000);const open=()=>{api.remoteControl({product,id,action:'toggle'}).then(v=>{if(!gone)setValue(v);}).catch(e=>{if(!gone)setValue({state:'failed',at:Date.now(),text:e.message});});};window.addEventListener('task-remote-control-open',open);return()=>{gone=true;clearInterval(timer);window.removeEventListener('task-remote-control-open',open);};},[product,id]);
 const act=async(action:string)=>{setBusy(true);try{setValue(await api.remoteControl({...task,action}));}catch(e){setValue({state:'failed',at:Date.now(),text:e instanceof Error?e.message:'The operation failed.'});}finally{setBusy(false);}};
 if(!value||value.state==='off')return null;
 const enabled=['ready','connected'].includes(value.state),waiting=['connecting','disconnecting','reconnecting'].includes(value.state);
 return <section className="thread remote-control" onMouseDown={e=>e.stopPropagation()} aria-label="Remote control">
  <div className="remote-command">/remote-control</div>
  <div className="remote-card"><div className="remote-main"><svg className="remote-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="12" height="10" rx="2"/><path d="M7 18h4M9 14v4"/><rect x="16" y="9" width="5" height="11" rx="1.5"/></svg><div className="remote-copy"><div className="remote-eyebrow" role="status">{enabled?'Remote control is on':waiting?value.state==='connecting'?'Connecting…':value.state==='disconnecting'?'Turning off…':'Reconnecting…':'Remote control'}</div><h3>{enabled?'Your conversation goes with you':value.state==='failed'?'Couldn’t connect': 'Pick up on another device'}</h3><p>{value.text|| (enabled?'Open this chat in Claude on your phone or browser.':'Continue this chat in Claude on your phone or browser.')}</p></div></div>
  <div className="remote-footer"><p className="remote-permission">{enabled||waiting?`Keep ${Name} running on this computer.`:'Anthropic syncs this conversation. Remote messages use this task’s tools and permissions.'}</p><div className="remote-actions">
  {enabled&&value.url?<a className="remote-primary" href={value.url} target="_blank" rel="noreferrer">Open in Claude <span aria-hidden="true">↗</span></a>:!waiting&&!value.mayBeActive?<button className="remote-primary" disabled={busy} onClick={()=>void act('enable')}>{value.state==='failed'?'Try again':'Enable Remote Control'} <span aria-hidden="true">→</span></button>:null}
  <button className="remote-secondary" disabled={busy||value.state==='connecting'||value.state==='disconnecting'} onClick={()=>void act(value.mayBeActive||enabled||waiting?'disable':'dismiss')}>{value.mayBeActive||enabled||waiting?'Turn off':'Not now'}</button>
  </div></div></div>
 </section>;
}
