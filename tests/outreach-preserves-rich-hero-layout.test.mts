// An animated character slot swallowed the whole sentence and left its brackets behind.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startableChrome} from '../shared/hidden-browser.mts';
import {setHeroHeadline} from '../scripts/lib/outreach-hero-copy.mts';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require(process.env.OUTREACH_BROWSER_MODULE||'playwright-core'));}catch{}
it.skipIf(!chromium)('keeps a highlighted word and the original text column',async()=>{
 const browser=await chromium.launch({executablePath:startableChrome()});
 try{
  const page=await browser.newPage();
  await page.setContent('<h1 data-outreach-hero style="font:60px/1.06 monospace;width:1200px"><span><span class="slot" style="display:inline-block;width:320px;border:1px solid red"><span class="word"><span>K</span><span>nowledge</span></span></span></span> Graphs<br>for AI Agents</h1>');
  const fit=await page.evaluate(setHeroHeadline,{text:'Give agents the full picture.',width:640,highlight:{selector:'.slot',textSelector:'.word'}});
  assert.equal(await page.locator('h1').textContent(),'Give agents the full picture.');
  assert.equal(await page.locator('.slot').textContent(),'Give');
  assert(fit.right-fit.left<=642);assert(fit.height<130);assert(!fit.overflow);
  await page.setContent('<div data-outreach-hero><p class="first">Describe your idea</p><p class="second" style="color:blue">Build apps with AI</p></div>');
  await page.evaluate(setHeroHeadline,{text:'Turn your idea into a working website.',width:640,textSelectors:['.first','.second'],lines:['Turn your idea into','a working website.']});
  assert.equal(await page.locator('.second').textContent(),'a working website.');
  assert.equal(await page.locator('.second').evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 255)');
 }finally{await browser.close();}
});
