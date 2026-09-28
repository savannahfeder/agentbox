// npm's node-pty 1.1.0 tarball ships macOS spawn-helper without its execute bit.
// Set it during build, before signing/packaging; never mutate a signed app.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const base=path.dirname(require.resolve('node-pty/package.json'));
for(const arch of ['darwin-arm64','darwin-x64']){const helper=path.join(base,'prebuilds',arch,'spawn-helper');if(fs.existsSync(helper))fs.chmodSync(helper,0o755);}
