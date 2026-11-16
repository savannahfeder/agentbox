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
// The shared code the app reads is TypeScript in .mts files now, imported by that name.
if (!config.resolver.sourceExts.includes('mts')) config.resolver.sourceExts.push('mts');
// On the web preview Metro takes obscenity's `import` build, a wrapper that reads an undefined default; the phones take its CommonJS one.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => (name === 'obscenity'
  ? { type: 'sourceFile', filePath: path.join(__dirname, 'node_modules', 'obscenity', 'dist', 'index.js') }
  : (resolveRequest ?? context.resolveRequest)(context, name, platform));

module.exports = config;
