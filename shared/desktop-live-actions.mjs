import {threadTldr} from './thread-tldr.mjs';
export function desktopLiveRows(inbox,progress){const seen=new Set();return [...inbox,...progress].filter(item=>{if(item.start==='manual')return false;const key=JSON.stringify([item.product,item.id]);if(seen.has(key))return false;seen.add(key);return true})}
export function desktopLiveView(current,rows=[]){if(current?.start==='manual')current=null;rows=desktopLiveRows(rows,[]);return {availableChats:rows.map(i=>({id:i.id,product:i.product,title:i.label||i.title,status:i.status})),current:current?{id:current.id,product:current.product,title:current.label||current.title,status:current.status}:null,latestAgentResult:current?threadTldr([{who:'it',text:current.result||current.note||''}])?.text||'Kein Agent-Ergebnis vorhanden.':''};}
export function desktopLiveActions({state,open,details,done,reply,later}){
 const liveState=()=>{const {rows,current}=state();return {rows:desktopLiveRows(rows,[]),current:current?.start==='manual'?null:current}};
 const screen=current=>{const {rows}=liveState();const view=desktopLiveView(current,rows);return {now:new Date().toISOString(),...view,current:current?{...view.current,position:rows.findIndex(i=>i.id===current.id&&i.product===current.product)+1,total:rows.length}:null,empty:!current}};
 return async a=>{
  const {rows,current}=liveState();let target=current;
  if(a.action==='read')return screen(target);
  if(a.action==='review'){target=current?.status==='done'?rows.find(i=>i.status!=='done'):(current||rows[0]);if(target)open(target);return screen(target)}
  if(a.action==='open'){target=rows.find(i=>i.id===a.id&&(a.product===undefined||i.product===a.product));if(!target)throw Error('Chat not found in the current list.');open(target);return screen(target)}
  if(a.action==='next'||a.action==='previous'){const at=rows.findIndex(i=>i.id===current?.id&&i.product===current?.product),step=a.action==='next'?1:-1;target=rows[at+step];if(!target)return {...screen(current),boundary:step===1?'end':'start'};open(target);return screen(target)}
  if(!current)throw Error('Open a chat first.');
  if(a.action==='details')return {...screen(current),details:await details(current)};
  if(a.id!==current.id||(a.product!==undefined&&a.product!==current.product))throw Error('The displayed chat changed. Read it again before taking action.');
  if(current.status==='done')throw Error('This chat is already done.');
  const next=rows[rows.findIndex(i=>i.id===current.id&&i.product===current.product)+1];
  if(a.action==='done')await done(current);
  else if(a.action==='reply'){if(typeof a.text!=='string'||!a.text.trim()||a.text.length>24000)throw Error('Response text is required.');await reply(current,a.text)}
  else if(a.action==='later'){const minutes=Number(a.text);if(!Number.isFinite(minutes)||minutes<1||minutes>525600)throw Error('Ask when to remind; pass minutes from now (1–525600).');await later(current,minutes)}
  else throw Error('Unsupported desktop action.');
  if(next){open(next);target=next}else {open(null);target=null;}
  return {...screen(target),action:a.action,boundary:next?undefined:'end'};
 };
}
