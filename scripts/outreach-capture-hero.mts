import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {startableChrome} from '../shared/hidden-browser.mts';
import {setHeroHeadline} from './lib/outreach-hero-copy.mts';
const [input,folder]=process.argv.slice(2);
const film=JSON.parse(fs.readFileSync(input,'utf8'));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:startableChrome(),args:['--hide-scrollbars']});
const options={viewport:{width:1440,height:810},deviceScaleFactor:2,colorScheme:'light' as const};
async function visit(page){
  await page.goto(film.creative?.heroURL||`https://${film.company.domain}`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(2000);
  const decline=page.getByRole('button',{name:/^(Decline|Reject all|Reject optional cookies)$/i});
  if(await decline.count()===1&&await decline.isVisible()){await decline.click();await page.waitForTimeout(500);}
  const text=await page.locator('body').innerText();
  if(/verify you are human|checking your browser|attention required|just a moment/i.test(text.slice(0,1000)))throw new Error('Bot check: skip this lead');
}
try{
  if(!process.argv.includes('--inspect')){
  const recorded=await browser.newContext({...options,recordVideo:{dir:folder,size:{width:1440,height:810}}});
  const page=await recorded.newPage();
  await visit(page);
  await page.screenshot({path:path.join(folder,'site-v2.png')});
  await page.waitForTimeout(6500);
  const video=page.video();await recorded.close();
  execFileSync('ffmpeg',['-v','error','-y','-threads','2','-sseof','-6','-i',await video.path(),'-t','6','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-r','30','-pix_fmt','yuv420p',path.join(folder,'hero-motion-v1.mp4')]);
  if(process.argv.includes('--motion-only')){await browser.close();process.exit(0);}
  }
  const context=await browser.newContext(options),view=await context.newPage();
  await visit(view);
  if(process.argv.includes('--inspect')){
    const candidates=await view.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,p,div,span')].filter(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return r.width&&r.height&&r.top>=0&&r.top<600&&parseFloat(s.fontSize)>=26&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent?.trim());
    }).map(el=>({html:el.outerHTML.slice(0,5000),font:getComputedStyle(el).font})).slice(0,30));
    fs.writeFileSync(path.join(folder,'hero-inspection.json'),JSON.stringify(candidates,null,2));await context.close();await browser.close();process.exit(0);
  }
  const reference=await view.evaluate(({selector,textSelector})=>{
    const slots=textSelector?[...document.querySelectorAll(textSelector)]:[];
    let h=slots[0]||[...document.querySelectorAll(selector||'h1')].find(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.top>=0&&r.top<600&&getComputedStyle(el).visibility!=='hidden';});
    if(slots.length)while(!slots.every(slot=>h.contains(slot)))h=h.parentElement;
    if(!h)throw new Error('No visible hero heading: inspect before filming');
    h.setAttribute('data-outreach-hero','true');
    const r=h.getBoundingClientRect(),s=getComputedStyle(slots[0]||h),rects=[];
    const walk=document.createTreeWalker(h,NodeFilter.SHOW_TEXT);
    for(let n=walk.nextNode();n;n=walk.nextNode())if(n.textContent?.trim()){const range=document.createRange();range.selectNodeContents(n);rects.push(...range.getClientRects());}
    const inkWidth=Math.max(...rects.map(r=>r.right))-Math.min(...rects.map(r=>r.left));
    return {headline:slots.length?slots.map(el=>el.textContent.trim()).join(' '):h.textContent?.trim(),height:r.height,font:s.font,letterSpacing:s.letterSpacing,inkWidth,width:r.width,html:h.outerHTML};
  },{selector:film.creative.heroSelector,textSelector:film.creative.heroTextSelector});
  await view.addStyleTag({content:'*,*::before,*::after{animation-play-state:paused!important;transition:none!important}'});
  const cdp=await context.newCDPSession(view);await cdp.send('Emulation.setScriptExecutionDisabled',{value:true});
  const clip=await view.evaluate(({highlight,inkWidth})=>{
    const r=document.querySelector('[data-outreach-hero]').getBoundingClientRect();
    let left=r.left,right=highlight?r.left+inkWidth+4:r.right,bottom=r.bottom;
    for(const el of document.querySelectorAll('p,a,button,input')){
      const q=el.getBoundingClientRect();
      if(q.width<8||q.height<8||q.width>1000||q.top<r.bottom-2||q.top>r.bottom+230||q.right<left-120||q.left>right+120)continue;
      if(!(el.textContent||el.getAttribute('placeholder')||'').trim())continue;
      left=Math.min(left,q.left);right=Math.max(right,q.right);bottom=Math.max(bottom,q.bottom);
    }
    const x=Math.max(0,left-24),y=Math.max(0,r.top-24),width=Math.min(1440-x,right-left+48);
    return {x,y,width,height:Math.min(810-y,Math.max(bottom-r.top+48,width/2.4))};
  },{highlight:film.creative.heroHighlight,inkWidth:reference.inkWidth});
  if(film.creative.heroCropBottomInset)clip.height-=film.creative.heroCropBottomInset;
  const shots=[];
  for(const [i,headline]of film.creative.headlines.entries()){
    const fit=await view.evaluate(setHeroHeadline,{text:headline,width:reference.inkWidth,highlight:film.creative.heroHighlight,textSelector:film.creative.heroTextSelector,lines:film.creative.headlineLines?.[i]});
    if(fit.overflow||fit.height>reference.height+2||fit.left<clip.x||fit.right>clip.x+clip.width||fit.bottom>clip.y+clip.height)throw new Error(`Headline ${i+1} exceeds the company's original headline layout`);
    const file=path.join(folder,`headline-${i+1}.png`);await view.screenshot({path:file,clip});shots.push(file);
  }
  execFileSync(process.env.OUTREACH_PYTHON||'python3',['-c',`from PIL import Image,ImageDraw
import sys
images=[Image.open(p).convert('RGB') for p in sys.argv[2:]]
w,h=images[0].size
sheet=Image.new('RGB',(w*3+80,h+60),(24,24,27))
for i,im in enumerate(images): sheet.paste(im,(20+i*(w+20),20))
sheet.save(sys.argv[1])`,path.join(folder,'headlines-v2.png'),...shots]);
  const hero={...reference,url:view.url(),checkedAt:new Date().toISOString(),motion:'recorded'};
  fs.writeFileSync(path.join(folder,'hero-reference.json'),JSON.stringify({...hero,headlines:film.creative.headlines},null,2));
  film.company.siteFile=path.resolve(folder,'site-v2.png');film.company.siteMotionFile=path.resolve(folder,'hero-motion-v1.mp4');
  film.headlinesFile=path.resolve(folder,'headlines-v2.png');film.creative.hero=hero;
  const thread=film.needsYou.find(row=>row.key==='headlines');
  if(thread)thread.context=[film.creative.rationale||'These alternatives keep the homepage’s visual style and express one clear benefit in a complete sentence.'];
  fs.writeFileSync(path.join(folder,'film-ready-v1.json'),JSON.stringify(film,null,2),{flag:'wx'});
  await context.close();
}finally{await browser.close();}
