// Remote registration belongs to the existing task process and account.
// No links or enabled state survive an app restart without a live provider.
import { Name } from '../shared/product-name.mjs';

export function remoteSessionUrl(value) {
 try { const url=new URL(value); return url.protocol==='https:'&&url.hostname==='claude.ai'&&!url.username&&!url.password&&!url.port&&/^\/code\/session_[A-Za-z0-9]+$/.test(url.pathname)&&!url.search&&!url.hash ? url.href : null; } catch { return null; }
}
export function remoteStatus(sup,product,id) { return sup._remoteControls?.get(JSON.stringify([product,id]))??null; }
export async function taskRemoteControl(sup,product,id,action='status') {
 const key=JSON.stringify([product,id]);
 sup._remoteControls??=new Map();
 const current=()=>sup._remoteControls.get(key);
 const publish=(state,extra={})=>{const value={state,at:Date.now(),...extra};sup._remoteControls.set(key,value);sup.onChange?.();return value;};
 const item=sup.store.readItem(product,id);
 if(!item||item.agent)throw Error('This task is not available.');
 if(action==='status')return current()??null;
 if(!['toggle','dismiss','enable','disable'].includes(action))throw Error('Unknown remote-control action.');
 if(sup._engineFor(item)==='codex')throw Error('Remote Control is currently available for Claude Code conversations only.');
 if(action==='dismiss')return current()?.state==='failed'&&!current()?.mayBeActive?publish('off'):current();
 if(current()?.state==='connecting'||current()?.state==='disconnecting')return current();
 // Typing the command IS the decision, so it never stops at a card asking again
 // (w-79bffd7ec3): it turns remote control on or off depending on its current
 // state, with no further confirmation.
 if(action==='toggle')action=['connected','ready','reconnecting'].includes(current()?.state)||current()?.mayBeActive?'disable':'enable';
 if(action==='enable'&&['connected','ready','reconnecting'].includes(current()?.state))return current();
 let session=sup.sessions.get(id);
 if(session&&session.product!==product)throw Error('The active session belongs to a different project.');
 if(action==='disable') {
  if(!session?.remoteHeld)return publish('off');
  publish('disconnecting');
  try { await session.child.control({subtype:'remote_control',enabled:false});session.remoteHeld=false;session.child.holdInput(false);if(session.remoteIdle&&session.child.stdin.writable)session.child.stdin.end();return publish('off'); }
  catch(error){return publish('failed',{text:error.message,mayBeActive:true});}
 }
 const project=sup.store.listProducts().find(p=>p.slug===product);
 const record=sup.rowSessionFor(item,project);
 if(!session&&!record?.sessionId)return publish('failed',{text:'Send a message in this task first, then enable Remote Control.'});
 publish('connecting');
 try {
  if(!session){sup.spawnWorker({...item,product},{continuation:true,resumeSessionId:record.sessionId,profile:record.profile,engine:'claude',remoteOnly:true});session=sup.sessions.get(id);}
  if(!session?.child?.control)throw Error('This conversation could not start. Check its account and try again.');
  session.child.holdInput(true);session.remoteHeld=true;
  if(!session.remoteListeners){
   session.remoteListeners=true;
   session.child.on('bridge-state',event=>{
    if(!session.remoteHeld||['disconnecting','off'].includes(current()?.state))return;
    if(current()?.epoch!=null&&event.bridge_epoch!=null&&current().epoch!==event.bridge_epoch)return;
    const state=['connected','ready','reconnecting'].includes(event.state)?event.state:event.state==='failed'||event.state==='policy_disabled'?'failed':'reconnecting';
    publish(state,{url:current()?.url,epoch:event.bridge_epoch,text:event.detail,mayBeActive:true});
   });
   session.child.once('exit',()=>publish('off',{text:'The local session ended. Run /remote-control to reconnect.'}));
  }
  session.remoteInit??=session.child.control({subtype:'initialize',hooks:{}});
  await session.remoteInit;
  const result=await session.child.control({subtype:'remote_control',enabled:true,name:item.title||`${Name} conversation`});
  const url=remoteSessionUrl(result.session_url);
  if(!url)throw Error('Claude did not return a valid remote session link.');
  return publish('ready',{url,epoch:result.bridge_epoch,mayBeActive:true});
 } catch(error) {
  // A timeout is not proof that registration failed. Explicitly turn it off;
  // if that cannot be confirmed, keep a visible stop action and the process.
  let mayBeActive=false;
  if(session?.remoteHeld){try{await session.child.control({subtype:'remote_control',enabled:false},5000);session.remoteHeld=false;session.child.holdInput(false);if(session.remoteIdle&&session.child.stdin.writable)session.child.stdin.end();}catch{mayBeActive=true;}}
  return publish('failed',{text:error.message,mayBeActive});
 }
}
