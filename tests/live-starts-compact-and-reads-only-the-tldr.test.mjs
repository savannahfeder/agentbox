// The call opened a large transcript panel and invited another verbose summary of the result.
import {it,expect,vi} from 'vitest';import fs from 'node:fs';import {setupLive} from '../renderer/src/live/live.js';
it('starts with a compact call panel and keeps the expand control',()=>{
 const node=(tag,props={},...children)=>({tag,props,children,append(...c){this.children.push(...c)},remove(){}});const body=node('body'),mount=node('nav');vi.stubGlobal('document',{body});vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}});
 try{const control=setupLive({el:node,mount});expect(body.children).toHaveLength(0);const panel=mount.children[1];expect(panel.props.class).toBe('live-panel compact');expect(JSON.stringify(panel.children)).toContain('Call-Protokoll umschalten');control.destroy();}finally{vi.unstubAllGlobals()}
});
it('instructs Live to read title and supplied TLDR verbatim, with details only on request',()=>{const source=fs.readFileSync(new URL('../renderer/src/live/live.js',import.meta.url),'utf8');expect(source).toContain('wortgetreu');expect(source).toContain('Keine Einleitung');expect(source).toContain('Details nur auf Nachfrage');expect(source).not.toContain('fasse das neueste Agent-Ergebnis');});
