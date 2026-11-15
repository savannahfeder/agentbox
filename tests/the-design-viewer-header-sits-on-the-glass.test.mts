// September 16: the beside design viewer still had a solid white header above
// a dark HTML page. Match the approved inline treatment, scoped to HTML beside
// previews so code, notes, and the separate Focus header keep their own chrome.
import { it, expect } from 'vitest';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../renderer/src/workspace-navigation.css', import.meta.url), 'utf8');
const scope = '.workspace-layout[data-artifact-layout="beside"] .doc-html';
it('puts the design toolbar on the app glass and frames only the preview', () => {
 expect(css).toContain(`${scope} .doc-card { background:transparent; border:0; box-shadow:none; }`);
 expect(css).toContain(`${scope} .doc-head { background:transparent; padding:0 0 10px; min-height:38px; }`);
 expect(css).toContain(`${scope} .doc-view { border:1px solid var(--line); border-radius:var(--radius); }`);
});
it('keeps code and notes toolbars out of the HTML-only override', () => {
 expect(css).not.toContain('.doc-code .doc-head { background:transparent;');
 expect(css).not.toContain('.doc-md .doc-head { background:transparent;');
 expect(css).toContain('.workspace-artifact-header .doc-head { padding:0; background:none;');
});
it('keeps the toolbar inside the card when the conversation reaches its minimum width', () => {
 // 1332px body = 400px chat + 932px viewer. A legacy 19px gap pushed X outside.
 expect(css).toContain('.workspace-layout[data-artifact-layout="beside"] > .body { gap:0; }');
});
