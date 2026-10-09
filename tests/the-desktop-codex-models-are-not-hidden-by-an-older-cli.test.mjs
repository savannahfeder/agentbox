// A standalone CLI can omit models the desktop Codex already offers. Compare
// automatic discovery with coexisting installs, explicit pins and no desktop.
import { it, expect, vi } from 'vitest';
import { findCodexBin, appCopyPaths } from '../main/codex-bin.mjs';

const home = '/home/test-user';
const cli = `${home}/.local/bin/codex`;
const desktop = '/Applications/Codex.app/Contents/Resources/codex';
const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const options = (...files) => ({ home, env: {}, exists: p => files.includes(p), readdir: () => [], dangles: () => false, shellLookup: vi.fn(() => ({ path: null, answered: true })) });

it.each([desktop, bundled, `${home}${bundled}`])('prefers desktop Codex at %s to an older standalone CLI', app => {
 const where = options(app, cli);
 expect(findCodexBin(where)).toMatchObject({ path: app, found: true, from: 'app' });
 expect(where.shellLookup).not.toHaveBeenCalled();
});
it('prefers the Codex app when both desktop apps are installed', () => {
 expect(findCodexBin(options(desktop, bundled, cli)).path).toBe(desktop);
});
it('uses an explicit binary even when a desktop copy exists', () => {
 expect(findCodexBin({ ...options(desktop, cli), configured: cli })).toMatchObject({ path: cli, from: 'settings' });
 expect(findCodexBin({ ...options(desktop), configured: '/missing/codex' })).toMatchObject({ path: '/missing/codex', found: false });
});
it('keeps standalone and shell installs working without a desktop copy', () => {
 expect(findCodexBin(options(cli))).toMatchObject({ path: cli, from: 'disk' });
 expect(findCodexBin({ ...options(), shellLookup: () => ({ path: '/custom/codex', answered: true }) })).toMatchObject({ path: '/custom/codex', from: 'shell' });
 expect(findCodexBin(options())).toMatchObject({ path: null, found: false, certain: true });
});
it('lists the native ChatGPT bundle in both Applications folders', () => {
 expect(appCopyPaths(home)).toContain(bundled);
 expect(appCopyPaths(home)).toContain(`${home}${bundled}`);
});
