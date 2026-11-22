import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { captureDOM, makeBindings, validateReplay } from './outreach-template.mjs';

export async function recordTemplate(page, source, folder, now, startClock = () => {}) {
  fs.mkdirSync(path.join(folder, 'assets'), {recursive:true});
  const bindings = makeBindings(source);
  const fixedImages = await page.evaluate(async()=>{
    const paths=[...new Set([...document.images].map((im)=>new URL(im.src,location.href).pathname).filter((p)=>p.startsWith('/pics/')&&!['/pics/logo.svg','/pics/site.png','/pics/headlines.png'].includes(p)))];
    return Promise.all(paths.map(async(p)=>({path:p,bytes:[...new Uint8Array(await(await fetch(p)).arrayBuffer())]})));
  });
  for(const asset of fixedImages)fs.writeFileSync(path.join(folder,'assets',path.basename(asset.path)),Buffer.from(asset.bytes));
  const head = await page.evaluate(() => ({head:document.head.innerHTML, attributes:[...document.documentElement.attributes].map((a)=>[a.name,a.value]),bodyAttributes:[...document.body.attributes].map((a)=>[a.name,a.value])}));
  head.head = head.head.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const gzip = zlib.createGzip();
  const output = fs.createWriteStream(path.join(folder,'frames.jsonl.gz'));
  gzip.pipe(output);
  const frames = [], assets = new Map();
  let busy = false, pending = Promise.resolve(), stopped = false;
  const sample = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const t = Math.max(0,now());
      const frame = await page.evaluate(captureDOM,{bindings});
      frame.html = frame.html.replace(/https?:\/\/127\.0\.0\.1:\d+/g,'').replace(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g,(_,encoded)=>{
        let name = assets.get(encoded);
        if (!name) {
          name = crypto.createHash('sha256').update(encoded).digest('hex')+'.png';
          fs.writeFileSync(path.join(folder,'assets',name),Buffer.from(encoded,'base64'));
          assets.set(encoded,name);
        }
        return '/replay-assets/'+name;
      });
      const entry = {t,...frame};
      if (!gzip.write(JSON.stringify(entry)+'\n')) await once(gzip,'drain');
      frames.push({t,site:frame.site,switcher:frame.switcher});
    } finally { busy = false; }
  };
  startClock();
  await sample();
  const timer = setInterval(()=>{pending=sample();},40);
  return { async stop(metadata) {
    clearInterval(timer);
    await pending;
    await sample();
    stopped = true;
    gzip.end();
    await once(output,'close');
    const maxGap = Math.max(...frames.slice(1).map((f,i)=>f.t-frames[i].t));
    const manifest = {...head,...metadata,bindings,source,frames,maxGap,fixedImages:fixedImages.map((a)=>a.path)};
    fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));
    validateReplay(frames,metadata.T1);
    console.log(`Replay saved: ${frames.length} samples, largest gap ${maxGap.toFixed(3)}s`);
  }};
}
