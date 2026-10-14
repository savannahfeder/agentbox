// External pages had no preview URL, while ordinary iframes could not display sites refusing framing.
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WebsiteView} from '../renderer/src/components/WebsiteView.tsx';
it('uses an isolated persistent guest for desktop websites',()=>{
 const html=renderToStaticMarkup(createElement(WebsiteView,{src:'https://example.com/',title:'Example',desktop:true,onReady(){},onError(){}}));
 expect(html).toContain('<webview');expect(html).toContain('partition="persist:websites"');expect(html).not.toContain('preload=');expect(html).not.toContain('nodeintegration');
});
it('uses a sandboxed frame when running in a browser',()=>{
 const html=renderToStaticMarkup(createElement(WebsiteView,{src:'https://example.com/',title:'Example',desktop:false,onReady(){},onError(){}}));
 expect(html).toContain('<iframe');expect(html).toContain('allow-forms');expect(html).not.toContain('<webview');
});

it('lets the guest load local sites without a cross-origin preflight that can time out',()=>{
 const pane=fs.readFileSync(new URL('../renderer/src/components/DocPane.tsx',import.meta.url),'utf8');
 expect(pane).toContain('useLocalPreview(website && desktop ? null : url)');
});
