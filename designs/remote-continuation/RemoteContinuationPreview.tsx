// Disposable design preview: no IPC, remote registration or actual link.
import {useState,useEffect} from 'react';
import './RemoteContinuationPreview.css';
export function RemoteContinuationPreview({product,id}:{product:string;id:string}){
 const initial=new URLSearchParams(location.search).get('remotePreview');
 const [variant,setVariant]=useState(['A','B','C'].includes(initial??'')?initial!:'A');
 const [state,setState]=useState<'confirm'|'connected'|'off'>('off');
 const [notice,setNotice]=useState('');
 useEffect(()=>{const receive=(event:Event)=>{const task=(event as CustomEvent).detail;if(task.product===product&&task.id===id){setState('confirm');setNotice('');}};window.addEventListener('remote-design-command',receive);return()=>window.removeEventListener('remote-design-command',receive);},[product,id]);
 if(!['A','B','C'].includes(initial??'')||location.hostname!=='127.0.0.1')return null;
 const active=state==='connected';
 const icon=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="12" height="10" rx="2"/><path d="M7 18h4M9 14v4"/><rect x="16" y="9" width="5" height="11" rx="1.5"/><path d="M18 17.5h1"/></svg>;
 return <section className="thread rc-preview" data-remote-preview onMouseDown={event=>event.stopPropagation()}>
  <div className="rc-design-bar"><span>Design preview</span><div className="rc-design-tabs" aria-label="Remote control design">{[['A','Compact card'],['B','Inset details'],['C','Action rail']].map(([key,label])=><button key={key} aria-pressed={variant===key} onClick={()=>{setVariant(key);setNotice('')}}>{key} · {label}</button>)}</div></div>
  {state==='off'?<p className="rc-entry">Run <code>/remote-control</code> in the reply box to preview this flow.</p>:<>
   <div className="rc-command">/remote-control</div>
   <div className={`rc-card rc-${variant}`}>
    <div className="rc-main"><div className="rc-icon">{icon}</div><div className="rc-copy"><div className="rc-eyebrow">{active?'Connected · preview':'Remote control'}</div><h3>{active?'Your conversation goes with you':'Pick up on another device'}</h3><p>{active?'Open this chat in Claude on your phone or browser.':'Continue this chat in Claude on your phone or browser.'}</p></div></div>
    <div className="rc-footer"><p className="rc-permission">{active?'Keep PowerUp running on this Mac.':<>Anthropic syncs this conversation. Remote messages use this task’s tools and permissions.</>}</p><div className="rc-actions"><button className="rc-secondary" onClick={()=>{setState('off');setNotice('')}}>{active?'Turn off':'Not now'}</button><button className="rc-primary" onClick={()=>{if(active)setNotice('Preview only — no remote link was created.');else setState('connected')}}>{active?'Open in Claude':'Enable Remote Control'}<span aria-hidden="true">{active?'↗':'→'}</span></button></div></div>
   </div>
   <div className="rc-footnote">{notice||'Preview only · no remote access enabled'}</div>
  </>}
 </section>;
}
