// The approved header must ship without any preview gates or simulated commands.
// Regression checks preserve the shared icon styling and the Command-K route.
import {it,expect} from 'vitest';import fs from 'node:fs';
it('exposes the task terminal without a preview query',()=>{
 const focus=fs.readFileSync('renderer/src/components/Focus.tsx','utf8');const app=fs.readFileSync('renderer/src/App.tsx','utf8');
 expect(focus).toContain('<TaskTerminal');expect(focus).not.toContain('directCommandPreview');expect(app).not.toContain('directCommandPreview');expect(app).toContain("label:'Open Terminal'");expect(app).toContain("new Event('task-terminal-open')");
});
it('shares header styling and keeps process disposal out of panel unmount',()=>{
 const source=fs.readFileSync('renderer/src/components/TaskTerminal.tsx','utf8');expect(source).toContain('icon-btn terminal-header-control');expect(source).not.toContain('commands are simulated');expect(source).toContain('observer.disconnect();subscription.dispose();terminal.dispose();');
 expect(source).toContain("action:'close'");expect(source).toContain("action:'resize'");
});
it('restores a terminal screen at its saved dimensions before fitting the new pane',()=>{
 const source=fs.readFileSync('renderer/src/components/TaskTerminal.tsx','utf8');expect(source).toContain('SerializeAddon');expect(source).toContain('screenCache');expect(source).toContain('cached.cols');
});
