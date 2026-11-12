// Technically valid exports reused stale hero images and fragmented headlines.
import {it} from 'vitest';
import assert from 'node:assert/strict';
import {validateCreative} from '../scripts/lib/outreach-creative.mts';
it('requires a dated hero reference and three complete single-sentence proposals',()=>{
 assert.throws(()=>validateCreative({}),/hero/i);
 const creative={hero:{url:'https://example.com',headline:'Build your team in one place',checkedAt:'2026-11-12',motion:'static'},headlines:['Build your team without adding another dashboard.','Bring every team decision into one inbox.','Your whole team can work from the same inbox.']};
 assert.doesNotThrow(()=>validateCreative({creative}));
 assert.throws(()=>validateCreative({creative:{...creative,headlines:['Your team. One inbox.',...creative.headlines.slice(1)]}}),/sentence/);
 assert.throws(()=>validateCreative({creative:{...creative,hero:{...creative.hero,motion:'animated'}}}),/recording/);
 assert.doesNotThrow(()=>validateCreative({company:{siteMotionFile:'hero.mp4'},creative:{...creative,hero:{...creative.hero,motion:'recorded'}}}));
 assert.throws(()=>validateCreative({creative:{...creative,headlines:[creative.headlines[0],creative.headlines[0],creative.headlines[2]]}}),/distinct/);
});
