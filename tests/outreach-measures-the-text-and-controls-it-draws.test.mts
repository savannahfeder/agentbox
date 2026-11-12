// A substituted reply kept the old caret, and a long project pushed Send onto another row.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startableChrome} from '../shared/hidden-browser.mts';
import {repairReplayDOM} from '../scripts/lib/outreach-layout.mts';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require(process.env.OUTREACH_BROWSER_MODULE||'playwright-core'));}catch{}
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
    await page.locator('.one-title').evaluate(el=>{
      el.textContent='ExampleCo · Check reminder timing after appointment moves';
      Object.assign(el.style,{font:'27px Arial',width:'760px',marginLeft:'278px'});
    });
    await page.evaluate(repairReplayDOM,{company:'ExampleCo'});
    await page.evaluate(()=>{document.body.style.transform='scale(1.45)';document.body.style.transformOrigin='0 0';});
    assert(await page.locator('.one-title').evaluate(el=>el.getBoundingClientRect().right<=1440));
  } finally {await browser.close();}
});
