// Electron's default menu would go up at `ready` and be replaced by installMenu.
// AppKit keeps its Window menu after that, and calling it once the menu's JS
// object is collected crashes the Mac app. Only an import runs before `ready`.

import { Menu } from 'electron';

if (process.platform === 'darwin') Menu.setApplicationMenu(null);
