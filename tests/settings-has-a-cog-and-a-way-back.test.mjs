// 2026-09-14: the old radial spokes read as a ship's wheel. Settings needs a
// toothed outline and a back control that preserves the previous task/list.
// 2026-09-26 (w-6c5534a58d): the glyph is now hairline sliders, her Hairline
// pick; the test still holds it to paths and no spokes.
import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import {SettingsIcon} from '../renderer/src/components/SettingsIcon';
it('draws the hairline sliders rather than radial spokes',()=>{
 const svg=renderToStaticMarkup(createElement(SettingsIcon));
 expect(svg).toContain('<path');expect(svg).not.toContain('<line');
 expect(svg).toContain('stroke-width="1.25"');
});
// The sidebar's Shortcuts row went on 2026-09-26 at her word (w-6c5534a58d):
// "isn't really important anymore given that we already introduced hover-over
// components to see shortcuts." The page is still in Settings and in ⌘K.
it('offers a back control, no sidebar shortcuts row and no instructions link',()=>{
 const app=fs.readFileSync(new URL('../renderer/src/App.tsx',import.meta.url),'utf8');
 const nav=app.slice(app.indexOf('<WorkspaceNavigation '),app.indexOf('{inFullScreen && !workspaceNavigation ?',app.indexOf('<WorkspaceNavigation ')));
 expect(nav).not.toContain('onShortcuts=');expect(nav).not.toContain('onInstructions=');
 expect(app).toContain('aria-label="Back to previous page"');
});
