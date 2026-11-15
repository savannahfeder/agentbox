// A comparison ended halfway through the legal text beneath its hero form.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startableChrome} from '../shared/hidden-browser.mts';
import {safeHeroBottom} from '../scripts/lib/outreach-hero-crop.mts';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require(process.env.OUTREACH_BROWSER_MODULE||'playwright-core'));}catch{}
it.skipIf(!chromium)('moves a crop above a cut paragraph or control',async()=>{
 const browser=await chromium.launch({executablePath:startableChrome()});
 try{
  const page=await browser.newPage();
  await page.setContent('<p style="position:absolute;top:100px;left:20px;margin:0;font:20px/30px Arial">Terms and conditions</p><button style="position:absolute;top:160px;left:20px;height:40px">Continue</button>');
  assert.equal(await page.evaluate(safeHeroBottom,{left:0,right:400,top:50,bottom:120}),92);
  assert.equal(await page.evaluate(safeHeroBottom,{left:0,right:400,top:50,bottom:180}),152);
  assert.equal(await page.evaluate(safeHeroBottom,{left:0,right:400,top:50,bottom:145}),145);
 }finally{await browser.close();}
});
