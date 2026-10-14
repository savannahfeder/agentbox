// The real composer showed only “Agent”, hiding the selected harness inside
// All models. Render its header with each remembered provider and one-provider Macs.
import {it,expect,vi,afterEach} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ThreadComposer} from '../renderer/src/threads/ThreadComposer';
import {ENGINES} from '../shared/engines.mjs';
import {LAST_ENGINE_KEY} from '../renderer/src/engines';
afterEach(()=>vi.unstubAllGlobals());
it.each(['claude','codex'])('names %s in To, separately from the model',engine=>{
 vi.stubGlobal('localStorage',{getItem:k=>k===LAST_ENGINE_KEY?engine:null});
 const html=renderToStaticMarkup(React.createElement(ThreadComposer,{products:[],items:[],engines:ENGINES,codexModels:[{id:'gpt-example',label:'GPT Example'}],codexModelDefault:'gpt-example',onClose(){},onSent(){}}));
 expect(html).toContain(`<span class="tc-word-text">${engine==='codex'?'Codex':'Claude Code'}</span>`);
});
it.each(ENGINES)('offers only the installed provider $id',engine=>{
 vi.stubGlobal('localStorage',{getItem:()=>null});
 const html=renderToStaticMarkup(React.createElement(ThreadComposer,{products:[],items:[],engines:[engine],codexModels:[{id:'gpt-example',label:'GPT Example'}],codexModelDefault:'gpt-example',onClose(){},onSent(){}}));
 expect(html).toContain(`<span class="tc-word-text">${engine.label}</span>`);
});
