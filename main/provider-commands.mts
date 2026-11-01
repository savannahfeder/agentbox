// Small adapters over provider operations. The supervisor owns routing, locks,
// account selection and persistence; these operations never start a fake prompt.
import { NAME } from '../shared/product-name.mjs';
export async function runCodexCommand({server,threadId,cwd,name,args=''}) {
 if(['skills','mcp','status','copy'].includes(name)&&args)throw new Error(`Run /${name} on its own. Your draft has been kept.`);
 if(name==='goal') {
  if(!args){const {goal}=await server.request('thread/goal/get',{threadId});return goal?`${goal.objective}\nStatus: ${goal.status}\nTokens used: ${goal.tokensUsed}`:'This conversation has no goal.';}
  if(args==='clear'){await server.request('thread/goal/clear',{threadId});return 'Goal cleared.';}
  if(args!=='pause')throw new Error(`Setting or resuming a Codex goal is not connected to ${NAME}’s worker lifecycle yet. Your draft has been kept.`);
  await server.request('thread/goal/set',{threadId,status:'paused'});
  return 'Goal paused.';
 }
 if(name==='skills') {
  const result=await server.request('skills/list',{cwds:[cwd],forceReload:true});
  return result.data?.flatMap(d=>[...(d.skills??[]).map(s=>`${s.name}${s.enabled===false?' (disabled)':''}: ${s.description??''}`),...(d.errors??[]).map(e=>`Could not read ${e.path}: ${e.message}`)]).join('\n')||'No skills found in this project.';
 }
 if(name==='mcp') {
  const rows=[];let cursor;
  do {const result=await server.request('mcpServerStatus/list',{threadId,...(cursor?{cursor}:{})});rows.push(...(result.data??[]));cursor=result.nextCursor;}while(cursor);
  return rows.map(s=>`${s.name}: ${Object.keys(s.tools??{}).length} tools; authentication ${s.authStatus??'unknown'}`).join('\n')||'No MCP servers are connected to this conversation.';
 }
 if(name==='status'||name==='copy') {
  const {thread}=await server.request('thread/read',{threadId,includeTurns:true});
  if(name==='copy') {
   const messages=(thread.turns??[]).filter(t=>t.status==='completed').flatMap(t=>t.items??[]).filter(i=>i.type==='agentMessage'&&i.text);
   if(!messages.length)throw new Error('There is no assistant response to copy yet.');
   return messages.at(-1).text;
  }
  return `Conversation: ${thread.id}\nStatus: ${thread.status?.type??'unknown'}\nFolder: ${thread.cwd??cwd}\nTurns: ${thread.turns?.length??0}`;
 }
 throw new Error(`/${name} is not available through ${NAME}’s Codex connection yet. Your draft has been kept.`);
}
