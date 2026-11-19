// Node strips the types from a .mts by itself, but refuses to for any file
// under node_modules, which is where `npx agentbox-app` installs the whole app.
// This strips them instead. Plain JavaScript, because it has to load before
// anything that is not. bin/agentbox.mjs imports it first, and every helper the
// app starts gets it through `--import` (main/strip-types.mts).
import fs from 'node:fs';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';

const ONCE = Symbol.for('agentbox.typescript-in-node-modules');
const INSTALLED_MTS = /\/node_modules\/.+\.mts$/;
// Below 22.15 neither exists, and a named import of them would stop a checkout
// from starting too. The npm package asks for 22.18 (package.json engines).
const { registerHooks, stripTypeScriptTypes } = nodeModule;

if (!globalThis[ONCE] && typeof registerHooks === 'function' && typeof stripTypeScriptTypes === 'function') {
  globalThis[ONCE] = true;
  // Node 22 warns that the stripper is experimental, on every start of every
  // helper; Node's own stripping of the same files says nothing.
  const warn = process.emitWarning;
  const quiet = (warning, type, ...rest) => (type === 'ExperimentalWarning' ? undefined : warn.call(process, warning, type, ...rest));
  registerHooks({
    load(url, context, nextLoad) {
      if (!url.startsWith('file:') || !INSTALLED_MTS.test(new URL(url).pathname)) return nextLoad(url, context);
      const source = fs.readFileSync(fileURLToPath(url), 'utf8');
      process.emitWarning = quiet;
      try {
        return { format: 'module', source: stripTypeScriptTypes(source, { sourceUrl: url }), shortCircuit: true };
      } finally {
        process.emitWarning = warn;
      }
    },
  });
}
