// September 16, real isolated browser test: workspace Codex + no remembered
// choice created a Claude chat. The composer never received the workspace
// default. Cover both defaults, explicit remembered choices and missing Codex.
import {afterEach,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Compose} from '../renderer/src/components/Compose.tsx';
import {ENGINES} from '../shared/engines.mjs';
import {readLastEngine,writeLastEngine} from '../renderer/src/engines.ts';
const saved=globalThis.localStorage;
afterEach(()=>{globalThis.localStorage=saved;});
function storage(entries=[]){const data=new Map(entries);return globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function card(workspaceEngine,engineChoices=ENGINES){return renderToStaticMarkup(createElement(Compose,{products:[{slug:'test',name:'Test'}],personal:[],hidden:[],onSend(){},onReorder(){},onHide(){},onClose(){},engineChoices,workspaceEngine}));}
it('opens on workspace Codex when no engine was picked',()=>{storage();const html=card('codex');expect(html).toContain('Codex');expect(html).not.toContain('Opus 5');});
it('keeps the Claude workspace default',()=>{storage();expect(card('claude')).toContain('Opus 5');});
it('keeps an explicit Codex pick over workspace Claude',()=>{storage();writeLastEngine('codex');expect(card('claude')).not.toContain('Opus 5');});
it('remembers explicit Claude instead of confusing it with no choice',()=>{storage();writeLastEngine(null);expect(readLastEngine(undefined,'codex')).toBe(null);expect(card('codex')).toContain('Opus 5');});
it('never selects unavailable Codex, including from the workspace default',()=>{storage();const html=card('codex',[ENGINES[0]]);expect(html).toContain('Opus 5');expect(html).not.toContain('clause-engine');});
it('treats a corrupt remembered value as no choice',()=>{storage([['zero.lastEngine','not-an-engine']]);expect(readLastEngine(undefined,'codex')).toBe('codex');});
