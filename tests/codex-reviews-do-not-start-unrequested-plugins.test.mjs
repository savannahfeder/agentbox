// September 18 live /review started creative_production_mcp despite apps=false
// and named MCP isolation. Current Codex plugins are a separate config layer.
import {it,expect} from 'vitest';
import {workerThreadParams,resumeThreadParams} from '../main/codex-session.mjs';
it.each([false,true])('disables plugin loading on a worker (resume=%s)',resume=>{
 const base=workerThreadParams({cwd:'/fixture',mcpServers:['personal'],storeServer:{name:'agentbox',command:'/store'}});
 const params=resume?resumeThreadParams('same-thread',base):base;
 expect(params.config.features).toMatchObject({apps:false,plugins:false,remote_plugin:false});
 expect(params.config.mcp_servers.agentbox.command).toBe('/store');
 expect(params.config.mcp_servers.personal.enabled).toBe(false);
});
