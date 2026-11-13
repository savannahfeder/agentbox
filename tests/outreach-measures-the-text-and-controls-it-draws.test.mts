// Replies and switcher labels kept stale text positions; long projects pushed Send onto another row.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startableChrome} from '../shared/hidden-browser.mts';
import {repairReplayDOM} from '../scripts/lib/outreach-layout.mts';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require(process.env.OUTREACH_BROWSER_MODULE||'playwright-core'));}catch{}
it.skipIf(!chromium)('centers the smaller semibold switcher label under every selected icon',async()=>{
  const browser=await chromium.launch({executablePath:startableChrome()});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:810}});
    await page.setContent(`<style>#film-switcher{position:absolute;left:300px;top:200px;padding:20px;border:1px solid transparent}.row{display:flex;gap:28px}.app{padding:10px}.app img{width:92px;height:92px}.name{position:absolute;bottom:4px}</style><div id="film-switcher"><div class="row">${Array.from({length:4},()=>'<div class="app"><img></div>').join('')}</div><div class="name" style="left:160.625px;transform:none">Terminal</div></div>`);
    for(const [index,label] of ['Google Chrome','Terminal','Agentbox','Finder'].entries()){
      await page.evaluate(({index,label})=>{
        document.querySelectorAll('.app').forEach((el,i)=>el.classList.toggle('on',i===index));
        document.querySelector('.name')!.textContent=label;
      },{index,label});
      await page.evaluate(repairReplayDOM,{company:'ExampleCo'});
      const measured=await page.evaluate(()=>{
        const label=document.querySelector('.name')!,icon=document.querySelector('.app.on img')!;
        const a=label.getBoundingClientRect(),b=icon.getBoundingClientRect(),css=getComputedStyle(label);
        return {delta:Math.abs((a.left+a.width/2)-(b.left+b.width/2)),size:css.fontSize,weight:css.fontWeight};
      });
      assert(measured.delta<0.5,`${label} is ${measured.delta}px off center`);
      assert.equal(measured.size,'15px');
      assert.equal(measured.weight,'600');
    }
  } finally {await browser.close();}
});
it.skipIf(!chromium)('measures the final reply, preserves company context and folds history',async()=>{
  const browser=await chromium.launch({executablePath:startableChrome()});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:810}});
    await page.setContent(`<style>textarea{font:20px Arial;padding:12px;width:500px;height:80px;box-sizing:border-box}#film-caret{position:absolute;left:900px;top:2px}.tc-bar{display:flex;flex-wrap:wrap;width:640px;gap:10px}.tc-anchor{flex-shrink:0}.tc-chip-name{display:block}.tc-chip{padding:10px}.tc-send-pair{margin-left:auto}</style><div class="one-sum"><h2 class="one-title">Fix reminders</h2></div><div class="thread"><div class="msg yours">You fix reminders</div></div><div class="appendix-foot"><div class="appendix-label">Result</div><p><strong>Merge the reminder fix?</strong></p><p>Checks passed.</p></div><textarea data-film-caret="white">Reviewer role granted</textarea><div id="film-caret"></div><div class="tc-bar"><span class="tc-anchor"><button class="tc-chip">Claude Code</button></span><span class="tc-anchor" data-tour="project"><button class="tc-chip"><span class="tc-chip-name">Lead and Contact Management and Scheduling</span></button></span><span class="tc-send-pair"><button>Send</button></span></div>`);
    const result=await page.evaluate(repairReplayDOM,{company:'ExampleCo'});
    assert.equal(await page.locator('.one-title').textContent(),'ExampleCo · Fix reminders');
    assert.equal(await page.locator('.msg.yours').count(),0);
    assert.equal(await page.locator('.one-answer .one-q').textContent(),'Merge the reminder fix?');
    assert(result.caret && result.caret[0]<500 && result.caret[0]>100);
    assert.equal(result.violations.length,0);
    const rows=await page.locator('.tc-bar').evaluate(el=>[...el.children].map(e=>e.getBoundingClientRect().top));
    assert(Math.max(...rows)-Math.min(...rows)<2);
    await page.locator('textarea').fill('A much shorter reply');
    const again=await page.evaluate(repairReplayDOM,{company:'ExampleCo'});
    assert.equal((await page.locator('.one-title').textContent())?.split('ExampleCo').length,2);
    assert.notDeepEqual(again.caret,result.caret);
    await page.locator('.tc-chip-name').evaluate(el=>{el.textContent='Workflows';});
    await page.evaluate(repairReplayDOM,{company:'ExampleCo'});
    assert(await page.locator('[data-tour="project"]').evaluate(el=>Math.abs(el.getBoundingClientRect().width-el.querySelector('button')!.getBoundingClientRect().width)<2));
    await page.locator('.one-title').evaluate(el=>{
      el.textContent='ExampleCo · Check reminder timing after appointment moves';
      Object.assign(el.style,{font:'27px Arial',width:'760px',marginLeft:'278px'});
    });
    await page.evaluate(repairReplayDOM,{company:'ExampleCo'});
    await page.evaluate(()=>{document.body.style.transform='scale(1.45)';document.body.style.transformOrigin='0 0';});
    assert(await page.locator('.one-title').evaluate(el=>el.getBoundingClientRect().right<=1440));
  } finally {await browser.close();}
});
