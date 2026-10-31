// npm's node-pty 1.1.0 tarball ships macOS spawn-helper without its execute bit.
// Set it during build, before signing/packaging; never mutate a signed app.
// node-pty is optional (main/pty.mjs), so a checkout that could not compile it
// has nothing here to fix and the build carries on without one.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
try{
  const base=path.dirname(require.resolve('node-pty/package.json'));
  for(const arch of ['darwin-arm64','darwin-x64']){const helper=path.join(base,'prebuilds',arch,'spawn-helper');if(fs.existsSync(helper))fs.chmodSync(helper,0o755);}
}catch(err){
  if(err?.code!=='MODULE_NOT_FOUND')throw err;
  console.log('agentbox: no node-pty in this checkout, so the build left the terminal alone.');
}
