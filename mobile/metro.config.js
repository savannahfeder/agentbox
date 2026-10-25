// The app shares the phone site's rules (renderer/src) and the browser-safe
// shared modules (shared/) instead of keeping copies. Only those two folders
// are watched, and every package resolves from this folder's node_modules:
// the desktop's React 18 one folder up must never reach this bundle.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const repo = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [path.join(repo, 'shared'), path.join(repo, 'renderer', 'src')];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];

module.exports = config;
