import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import {once} from 'node:events';
import {bridgeHold,validateReplay} from './lib/outreach-template.mjs';

const [input,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: outreach-prepare.mjs raw-template prepared-template');
if(path.resolve(input)===path.resolve(output))throw new Error('Keep the raw capture separate');
const manifest=JSON.parse(fs.readFileSync(path.join(input,'manifest.json')));
fs.mkdirSync(output,{recursive:true});
fs.cpSync(path.join(input,'assets'),path.join(output,'assets'),{recursive:true});
const gzip=zlib.createGzip(),destination=fs.createWriteStream(path.join(output,'frames.jsonl.gz'));
gzip.pipe(destination);
const lines=readline.createInterface({input:fs.createReadStream(path.join(input,'frames.jsonl.gz')).pipe(zlib.createGunzip())});
const frames=[],holds=[];
let previous;
async function write(frame){
  if(!gzip.write(JSON.stringify(frame)+'\n'))await once(gzip,'drain');
  frames.push({t:frame.t,site:frame.site,switcher:frame.switcher});
}
for await(const line of lines){
  const frame=JSON.parse(line);
  if(previous&&frame.t-previous.t>.15){
    const bridge=bridgeHold(previous,frame);
    holds.push({from:previous.t,to:frame.t,frames:bridge.length});
    for(const fill of bridge)await write(fill);
  }
  await write(frame);previous=frame;
}
gzip.end();await once(destination,'close');
validateReplay(frames,manifest.T1);
manifest.rawMaxGap=manifest.maxGap;
manifest.maxGap=Math.max(...frames.slice(1).map((f,i)=>f.t-frames[i].t));
manifest.frames=frames;manifest.staticHolds=holds;
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest));
console.log(JSON.stringify({samples:frames.length,maxGap:manifest.maxGap,staticHolds:holds}));
