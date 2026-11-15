// The replay lost root overlays and reused another owner's repeated words.
import {it} from 'vitest';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startableChrome} from '../shared/hidden-browser.mts';
import {captureDOM,injectDOM,makeBindings,pointerSprite} from '../scripts/lib/outreach-template.mjs';
const require=createRequire(import.meta.url);
let chromium=null;
try { ({chromium}=require(process.env.OUTREACH_BROWSER_MODULE||'playwright')); } catch {}
let executable=null;
try {executable=startableChrome();} catch {}
it.skipIf(!chromium||!executable||!fs.existsSync(executable))('keeps overlays, scoped titles, project tags and comments',async()=>{
const source={company:{name:'Example'},projects:[{slug:'api',name:'API'},{slug:'docs',name:'Docs'}],needsYou:[{title:'Fix shared title',project:'api'}],team:{people:[{name:'Maya Chen',threads:[{title:'Fix shared title',project:'API'}]}]}};
const target={company:{name:'Other'},projects:[{slug:'query',name:'Queries'},{slug:'setup',name:'Setup'}],needsYou:[{title:'Fix query timeouts',project:'query'}],team:{people:[{name:'Maya Chen',threads:[{title:'Fix setup links',project:'Setup'}]}]}};
source.needsYou.push({key:'maya',title:'Debug staging access',project:'api',comment:'Please grant access'});
target.needsYou.push({key:'maya',title:'Debug query access',project:'query',comment:'Please grant query access'});
source.needsYou.push({title:'Fix board project',project:'api'});
target.needsYou.push({title:'Fix workspace docs',project:'setup'});
source.needsYou.push({key:'jordan',title:'Write weekly updates',project:'docs',comment:'Add API fix too?'});
target.needsYou.push({key:'jordan',title:'Write query updates',project:'setup',comment:'Add setup fixes too?'});
source.team.people[0].threads.push({title:'Fix shared title',project:'API'});
target.team.people[0].threads.push({title:'Fix docs links',project:'Setup'});
const bindings=makeBindings(source);
const token=s=>bindings.find(b=>b.source===s).token;
const browser=await chromium.launch({executablePath:executable});
try {
const page=await browser.newPage();
await page.setContent(`<div class="th-mark">E</div><button class="hm-row"><b>${token('Fix shared title')}</b><span class="hm-tag">${token('API')}</span></button><button class="hm-mate"><b>${token('Maya Chen')}</b><small>${token('Fix shared title')}</small></button><div class="row maya"><div class="th-cell-title">${token('Debug staging access')}</div><div class="th-cell-state">Waiting on you</div></div><div class="row jordan"><div class="th-cell-title">${token('Write weekly updates')}</div><div class="th-cell-state">Answered</div></div><p>Jordan commented: Please grant access</p><section class="td-person"><h2>${token('Maya Chen')}</h2><div data-group="working"><button class="td-line">${token('Fix shared title')}</button><button class="td-line">${token('Fix shared title')}</button></div></section>`);
await page.evaluate(()=>{for(const id of ['film-site','film-switcher','film-pointer']){const el=document.createElement('div');el.id=id;document.documentElement.append(el);}});
await page.locator('.jordan .th-cell-title').evaluate(el=>{el.textContent='Write weekly updates...';});
await page.evaluate(({title,project})=>{const board=document.createElement('div');board.className='th-board';board.innerHTML=`<button class="th-card"><div class="t">${title}</div><div class="m"><span class="p">${project}</span></div></button>`;document.body.append(board);},{title:token('Fix board project'),project:token('API')});
const capture=await page.evaluate(captureDOM,{bindings});
assert(capture.html.includes('id="film-site"'));
assert(capture.html.includes('id="film-pointer"'));
await page.evaluate(injectDOM,{bindings,source,target});
assert.equal(await page.locator('.hm-row b').textContent(),'Fix query timeouts');
assert.equal(await page.locator('.hm-tag').textContent(),'Queries');
assert.equal(await page.locator('.hm-mate small').textContent(),'Fix setup links');
assert.equal(await page.locator('.th-mark').textContent(),'O');
assert.equal(await page.locator('.th-aside').textContent(),'Maya commented: Please grant query access');
assert.equal(await page.locator('p').textContent(),'Jordan commented: Please grant query access');
assert.equal(await page.locator('.th-card .p').textContent(),'Setup');
assert.equal(await page.locator('.jordan .th-aside').count(),0);
assert.deepEqual(await page.locator('.td-line').allTextContents(),['Fix setup links','Fix docs links']);
await page.evaluate(({html})=>{document.body.innerHTML=html;document.querySelector('.jordan .th-cell-state').textContent='Waiting on you';document.querySelector('.maya .th-cell-state').textContent='Working';},capture);
await page.evaluate(injectDOM,{bindings,source,target});
assert.equal(await page.locator('.jordan .th-aside').count(),1);
assert.equal(await page.locator('.jordan .th-aside').textContent(),'Jordan commented: Add setup fixes too?');
assert.equal(await page.locator('.maya .th-aside').count(),0);
const sprite=await pointerSprite(browser,'<body style="background:black"><div id="film-pointer"><svg xmlns="http://www.w3.org/2000/svg" width="29" height="29"><path fill="white" d="M1 1L1 20L8 14L18 14Z"/></svg></div></body>');
assert.equal(sprite[25],6);
assert.equal(sprite.readUInt32BE(16),58);
assert.equal(sprite.readUInt32BE(20),58);
} finally {await browser.close();}

});

