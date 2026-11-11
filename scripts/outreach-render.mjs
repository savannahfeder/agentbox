import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startableChrome } from '../shared/hidden-browser.mts';
import { injectDOM, sceneAt, pointerAt, pointerSprite, recordingTime, escapeHtml, cameraBox, validateReplay, replayKey } from './lib/outreach-template.mjs';

const [folder, input, output, dist, ...flags] = process.argv.slice(2);
if (!dist) throw new Error('Usage: outreach-render.mjs template film.json screen.mp4 app-dist [--at seconds]');
const layerMode=flags.includes('--layers')&&!flags.includes('--at');
const manifest = JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
const target = JSON.parse(fs.readFileSync(input));
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
validateReplay(manifest.frames, manifest.T1);
const frames=[];
const lines=readline.createInterface({input:fs.createReadStream(path.join(folder,'frames.jsonl.gz')).pipe(zlib.createGunzip()),crlfDelay:Infinity});
for await(const line of lines) {
  const frame=JSON.parse(line);
  if(frame.site&&!frame.html.includes('id="film-site"'))throw new Error('Replay omits the homepage overlay');
  const bucket=Math.floor(frame.t*30);
  if(frames.length>1&&Math.floor(frames.at(-1).t*30)===bucket)frames[frames.length-1]=frame;
  else frames.push(frame);
}
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.ttf':'font/ttf'};
const company = target.company;
const asset = (file,name) => {
  if(fs.existsSync(file))return file;
  const local=path.join(path.dirname(input),path.basename(file));
  if(fs.existsSync(local))return local;
  const slug=process.env.OUTREACH_LEAD_SLUG||company.name.toLowerCase().replace(/[^a-z0-9]/g,'');
  return path.join(folder,'..','leads',slug,name);
};
const assets = {'/pics/site.png':asset(company.siteFile,'site.png'),'/pics/logo.svg':asset(company.logoFile,'logo.png'),'/pics/headlines.png':asset(target.headlinesFile,'headlines.png')};
for(const p of manifest.fixedImages||[])assets[p]=path.join(folder,'assets',path.basename(p));
for(const file of Object.values(assets))if(!file||!fs.existsSync(file))throw new Error(`Missing image ${file}`);
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = assets[pathname] || (pathname.startsWith('/replay-assets/') ? path.join(folder,'assets',path.basename(pathname)) : path.join(dist,pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath:startableChrome(),args:['--hide-scrollbars']});
const context = await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:layerMode?2:4/3,colorScheme:'dark'});
const page = await context.newPage();
await page.goto(origin+'/index.html');
await page.evaluate(({head,attributes,bodyAttributes})=>{
  document.head.innerHTML = head;
  for (const [name,value] of attributes) document.documentElement.setAttribute(name,value);
  for (const [name,value] of bodyAttributes) document.body.setAttribute(name,value);
  const style = document.createElement('style');
  style.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{overflow:hidden}body{width:1440px!important;height:810px!important;overflow:hidden!important;transform-origin:0 0!important}.home-sky img{display:block;width:100%;height:100%}';
  document.head.appendChild(style);
},manifest);
await page.evaluate(()=>document.fonts.ready);
const sourceReply = manifest.source.needsYou.find((t)=>t.key==='maya').reply;
const targetReply = target.needsYou.find((t)=>t.key==='maya').reply;
const codeTokens = new Set(manifest.bindings.filter((b)=>b.paths.some((p)=>p[0]==='change')).map((b)=>b.token));
let tokenizer = null;
const codeModule=process.env.OUTREACH_CODE_MODULE||path.join(folder,'code-tokens.mjs');
if(fs.existsSync(codeModule)) tokenizer=(await import(pathToFileURL(codeModule).href)).tokenize;
const codeRows = target.change?.files.map((file)=>({...file,rows:file.hunks.flatMap((h)=>h.rows).map(([mark,line])=>({mark,line,html:tokenizer ? tokenizer(line).map((t)=>t.c?`<span class="t-${t.c}">${escapeHtml(t.s)}</span>`:escapeHtml(t.s)).join(''):escapeHtml(line)}))}));

function camera(t) {
  return cameraBox(manifest.camera,t);
}
let lastContent=null;
let lastMouse=null,lastHover=null;
async function hoverAt(pointer,box,force=false) {
  if(!pointer)return lastHover;
  const factor=1440/(box[2]-box[0]);
  const x=Math.max(0,Math.min(1439,(pointer[0]+8.9-box[0])*factor));
  const y=Math.max(0,Math.min(809,(pointer[1]+4-box[1])*factor));
  if(!force&&lastMouse&&Math.hypot(x-lastMouse[0],y-lastMouse[1])<1)return lastHover;
  await page.mouse.move(x,y);lastMouse=[x,y];
  lastHover=await page.evaluate(({x,y})=>{
    const selector='button,a,.row,.code-row,[role="button"]';
    const element=document.elementFromPoint(x,y)?.closest(selector);
    return element?[...document.querySelectorAll(selector)].indexOf(element):-1;
  },{x,y});
  return lastHover;
}

async function draw(t) {
  const actual=recordingTime(manifest.beats,t);
  const frame = sceneAt(frames,actual);
  const html = frame.html.replace(/__OUTREACH_\d+__/g,(token)=>codeTokens.has(token)?'':token);
  const box = layerMode?[0,0,1440,810]:camera(actual);
  const pointer=pointerAt(frames,actual);
  const content=replayKey(frame,html);
  if(content===lastContent) {
    if(layerMode){const previous=lastHover;await hoverAt(pointer,box);return previous===lastHover?null:page.screenshot({type:'png'});}
    await page.evaluate(({pointer,box})=>{
      if(pointer)document.getElementById('film-pointer').style.translate=`${pointer[0]}px ${pointer[1]}px`;
      document.body.style.transform=`matrix(${1440/(box[2]-box[0])},0,0,${1440/(box[2]-box[0])},${-box[0]*1440/(box[2]-box[0])},${-box[1]*1440/(box[2]-box[0])})`;
    },{pointer,box});
    await hoverAt(pointer,box);
    return page.screenshot({type:'jpeg',quality:95});
  }
  await page.evaluate(async ({html,scroll,box,pointer,layerMode,sourceReply,targetReply,codeRows,codeStats})=>{
    document.body.innerHTML=html;
    const app=document.querySelector('.app.workspace-layout');
    if(app){app.classList.remove('gt-rail-open');app.classList.add('workspace-collapsed');}
    for(const sky of document.querySelectorAll('.home-sky'))Object.assign(sky.style,{left:'82px',top:'40px',width:'1336px',height:'748px'});
    for(const [key,sign]of [['plus','+'],['minus','−']]) {
      const figure=document.querySelector(`.ts-code-figures .code-${key}`);
      if(figure&&codeStats)figure.textContent=codeStats[key]?`${sign}${codeStats[key]}`:'';
    }
    if(pointer&&document.getElementById('film-pointer'))document.getElementById('film-pointer').style.translate=`${pointer[0]}px ${pointer[1]}px`;
    if(layerMode)document.getElementById('film-pointer').style.visibility='hidden';
    document.body.style.transform=`matrix(${1440/(box[2]-box[0])},0,0,${1440/(box[2]-box[0])},${-box[0]*1440/(box[2]-box[0])},${-box[1]*1440/(box[2]-box[0])})`;
    for (const el of document.querySelectorAll('[data-replay-scroll]')) {
      const [x,y]=scroll[Number(el.getAttribute('data-replay-scroll'))];el.scrollTo(x,y);
    }
    for (const el of document.querySelectorAll('textarea')) {
      const text=el.value;
      if (!text || text===targetReply || /__OUTREACH_\d+__/.test(text)) continue;
      let common=0;while(common<text.length&&text[common]===sourceReply[common]) common++;
      const n=Math.round(common/sourceReply.length*targetReply.length);
      el.value=targetReply.slice(0,n)+(common<text.length ? (targetReply[n]==='o'?'i':'o'):'');
    }
    if (codeRows && document.querySelector('.code-body')) {
      const summary=document.querySelector('.code-tree-count');
      if(summary)summary.textContent=`${codeRows.length} ${codeRows.length===1?'file':'files'}${codeStats.plus?` +${codeStats.plus}`:''}${codeStats.minus?` −${codeStats.minus}`:''}`;
      const tree=document.querySelector('.code-tree-rows');
      const folderTemplate=tree?.querySelector('.code-folder')?.cloneNode(true);
      const fileTemplate=tree?.querySelector('.code-file')?.cloneNode(true);
      if(tree&&fileTemplate) {
        tree.replaceChildren();
        const folders=new Set();
        for(const [i,file]of codeRows.entries()) {
          const parts=file.path.split('/');
          for(let depth=0;depth<parts.length-1;depth++) {
            const prefix=parts.slice(0,depth+1).join('/')+'/';
            if(folders.has(prefix)||!folderTemplate)continue;
            folders.add(prefix);
            const row=folderTemplate.cloneNode(true);
            row.style.paddingLeft=`${12+depth*13}px`;
            row.querySelector('.code-node-name').textContent=parts[depth];
            row.querySelector('.code-node-n').textContent=String(codeRows.filter(f=>f.path.startsWith(prefix)).length);
            tree.append(row);
          }
          const row=fileTemplate.cloneNode(true);
          row.classList.toggle('is-at',i===0);
          row.style.paddingLeft=`${12+(parts.length-1)*13}px`;
          row.title=file.path;
          row.querySelector('.code-node-name').textContent=parts.at(-1);
          const counts=row.querySelector('.code-counts');
          if(counts)counts.innerHTML=(file.plus?`<span class="code-plus">+${Number(file.plus)}</span>`:'')+(file.minus?`<span class="code-minus">−${Number(file.minus)}</span>`:'');
          tree.append(row);
        }
      }
      const blocks=[...document.querySelectorAll('.code-file-block')];
      for (let i=0;i<blocks.length;i++) {
        const block=blocks[i],file=codeRows[i];
        if (!file) {block.remove();continue;}
        block.querySelector('.code-file-name').textContent=file.path.split('/').pop();
        block.querySelector('.code-file-where').textContent=file.path.split('/').slice(0,-1).join('/');
        const counts=block.querySelector('.code-counts');
        if(counts) counts.innerHTML=(file.plus?`<span class="code-plus">+${Number(file.plus)}</span>`:'')+(file.minus?`<span class="code-minus">−${Number(file.minus)}</span>`:'');
        let number=0;
        const markup=file.rows.map(({mark,html})=>`<div class="code-row${mark==='+'?' cr-plus':mark==='-'?' cr-minus':''}"><span class="code-num">${mark==='-'?'':++number}</span><span class="code-mark">${mark==='='?'':mark==='+'?'+':'−'}</span><span class="code-line">${html}</span></div>`).join('');
        const hunk=block.querySelector('.code-hunk-block')||block.querySelector('.code-hunk');
        if (hunk) {hunk.innerHTML=markup;for(const other of block.querySelectorAll('.code-hunk-block,.code-hunk'))if(other!==hunk&&!hunk.contains(other))other.remove();}
      }
      for(const [i,el] of [...document.querySelectorAll('.code-file-picker option')].entries())if(codeRows[i])el.textContent=codeRows[i].path;
    }
    await Promise.all([...document.images].map((im)=>im.decode().catch(()=>{})));
  },{html,scroll:frame.scroll,box,pointer,layerMode,sourceReply,targetReply,codeRows,codeStats:target.change});
  await page.evaluate(injectDOM,{bindings:manifest.bindings,target,source:manifest.source});
  await page.evaluate(({source,target})=>{
    const text=document.body.innerText.toLowerCase();
    for(const value of [source.company.name,source.company.domain]) {
      if(![target.company.name,target.company.domain].some(v=>v.toLowerCase().includes(value.toLowerCase()))&&text.includes(value.toLowerCase()))throw new Error(`Source company remains visible: ${value}`);
    }
    if(/__OUTREACH_\d+__/.test(document.body.innerText))throw new Error('Unresolved replay field remains visible');
  },{source:manifest.source,target});
  lastContent=content;
  await hoverAt(pointer,box,true);
  return page.screenshot(layerMode?{type:'png'}:{type:'jpeg',quality:95});
}

const atIndex=flags.indexOf('--at');
try {
  if(atIndex>=0) {
    fs.writeFileSync(output,await draw(Number(flags[atIndex+1])));
  } else if(layerMode) {
    const cache=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-scenes-'));
    try {
      const sprite=path.join(cache,'pointer.png');
      fs.writeFileSync(sprite,await pointerSprite(browser,frames[0].html));
      const plan={scale:2,pointer:sprite,frames:[]};
      let file=null,count=0;
      const started=Date.now();
      for(let k=0;k<2913;k++) {
        const t=k/30,image=await draw(t),actual=recordingTime(manifest.beats,t);
        if(image){file=path.join(cache,`${count++}.png`);fs.writeFileSync(file,image);}
        plan.frames.push({file,pointer:pointerAt(frames,actual),box:camera(actual)});
        if(k%300===0)console.log(`scene ${k}/2913, ${count} drawings, ${(Date.now()-started)/1000}s`);
      }
      const planFile=path.join(cache,'plan.json');fs.writeFileSync(planFile,JSON.stringify(plan));
      await context.close();await browser.close();server.close();
      const compositor=spawn(process.env.OUTREACH_COMPOSITOR_PYTHON||process.env.OUTREACH_PYTHON||'python3',[fileURLToPath(new URL('./outreach-compose.py',import.meta.url)),planFile,output],{stdio:'inherit'});
      const [code]=await once(compositor,'close');
      if(code!==0)throw new Error(`Compositor exited ${code}`);
    } finally {fs.rmSync(cache,{recursive:true,force:true});}
  } else {
    const encoder=spawn('ffmpeg',['-v','error','-y','-filter_threads','1','-f','image2pipe','-framerate','30','-c:v','mjpeg','-threads','2','-i','-','-c:v','libx264','-threads','2','-preset','veryfast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
    const started=Date.now();
    for(let k=0;k<2913;k++) {
      const image=await draw(k/30);
      if(!encoder.stdin.write(image))await once(encoder.stdin,'drain');
      if(k%300===0)console.log(`frame ${k}/2913, ${(Date.now()-started)/1000}s`);
    }
    encoder.stdin.end();
    const [code]=await once(encoder,'close');
    if(code!==0)throw new Error(`Encoder exited ${code}`);
  }
} finally {
  if(browser.isConnected()){await context.close();await browser.close();}server.close();
}
