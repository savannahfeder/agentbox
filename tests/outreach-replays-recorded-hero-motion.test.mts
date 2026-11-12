// A homepage PNG silently froze animated heroes. Different requested times must show different frames.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startableChrome} from '../shared/hidden-browser.mts';
import {setHeroFrame} from '../scripts/lib/outreach-hero-motion.mts';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require(process.env.OUTREACH_BROWSER_MODULE||'playwright-core'));}catch{}
it.skipIf(!chromium)('seeks the recorded hero rather than freezing or autoplaying it',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hero-motion-'));
 const file=path.join(folder,'motion.mp4');
 execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=2','-c:v','libx264','-threads','2',file]);
 const browser=await chromium.launch({executablePath:startableChrome()});
 try{
  const page=await browser.newPage();await page.setContent('<div id="film-site" style="position:fixed;inset:0"><img></div>');
  const url='data:video/mp4;base64,'+fs.readFileSync(file).toString('base64');
  await page.evaluate(setHeroFrame,{url,time:.1});const first=await page.screenshot();
  await page.evaluate(setHeroFrame,{url,time:1.5});const later=await page.screenshot();
  assert(!first.equals(later));
  await page.evaluate(setHeroFrame,{url,time:.1});assert(first.equals(await page.screenshot()));
  assert.equal(await page.locator('video').evaluate(el=>el.paused),true);
 }finally{await browser.close();fs.rmSync(folder,{recursive:true,force:true});}
});
