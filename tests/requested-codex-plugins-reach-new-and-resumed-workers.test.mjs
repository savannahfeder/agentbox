// Installed plugins disappeared because every worker explicitly disabled their
// feature flags. An explicit workspace opt-in must survive both start and resume.
import {it,expect} from 'vitest';
import {workerThreadParams,resumeThreadParams} from '../main/codex-session.mjs';
it.each([false,true])('allows explicitly requested plugins (resume=%s)',resume=>{
 const base=workerThreadParams({cwd:'/fixture',plugins:true,mcpServers:['personal'],storeServer:{name:'agentbox',command:'/store'}});
 const params=resume?resumeThreadParams('same-thread',base):base;
 expect(params.config.features).toEqual({apps:true,plugins:true,remote_plugin:true});
 expect(params.config.mcp_servers.personal.enabled).toBe(false);
 expect(params.config.mcp_servers.agentbox.command).toBe('/store');
});
it.each([undefined,false,'true',1])('keeps integrations disabled without explicit boolean opt-in (%s)',plugins=>{
 expect(workerThreadParams({cwd:'/fixture',plugins}).config.features).toEqual({apps:false,plugins:false,remote_plugin:false});
});
