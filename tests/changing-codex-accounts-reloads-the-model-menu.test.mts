// The settings page changed accounts while the composer retained the old plan and catalog.
// Pin the refresh and notification at the account control rather than every settings write.
import {it,expect} from 'vitest';
import fs from 'node:fs';
it('refreshes the chosen account before notifying the composer',()=>{
 const source=fs.readFileSync('renderer/src/components/Settings.tsx','utf8');
 const onUse=source.slice(source.indexOf('onUse: (profile)'),source.indexOf('// Signing in to the cloud from a tile'));
 expect(onUse).toContain("api.agentUpdate(engine, 'refresh')");
 expect(onUse.indexOf("api.agentUpdate(engine, 'refresh')")).toBeLessThan(onUse.indexOf("new Event('agent-models-changed')"));
});
