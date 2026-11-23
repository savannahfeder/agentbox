// A PROGRAM THE APP RUNS IN THE BACKGROUND NEVER FLASHES A CONSOLE ON WINDOWS.
//
// Run against main, this test found one child_process call in main/ and mcp/
// that passed windowsHide: true (the taskkill in main/task-terminals.mts).
// Windows gives a console program started by a program with no console of its
// own a new console window. Measured with a detached Node parent with no
// console standing in for Electron: a child started with piped stdio and no
// windowsHide got a visible console window; with windowsHide it got none, and
// a grandchild it spawned with no flags got none either (it shares the hidden
// console), so workers' own git, bash and rg do not flash. An earlier reading
// that piped stdio stayed quiet was likely taken with the app started from a
// terminal, which lends it a console. windowsHide asks for no window (libuv
// sets CREATE_NO_WINDOW when no stdio is inherited) and Mac and Linux ignore
// it, so every background call now says it.
//
// It also starts a program's first window hidden, so a call that is meant to
// put a window on the screen must not: the browser, the system's file chooser,
// Notepad, an app brought to the front, a second copy of the app. Those are
// listed below with the reason. Anything else that
// starts a program from main/, shared/ or mcp/ fails here until it says
// windowsHide: true, in the call or in a const object it is handed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const APP = ['main', 'shared', 'mcp'];
const CALLS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']);

// Each is a file and the start of the call, as the source spells it.
const SHOWS_A_WINDOW = [
  { file: 'main/open-in-browser.mts', call: 'execFile(cmd, args, opts', why: 'opens a page in the browser' },
  { file: 'main/os-folder-window.mts', call: 'execFile(cmd, args', why: "the system's file chooser, waiting on a person" },
  { file: 'main/open-source-file.mts', call: 'spawn(notepad', why: 'opens a source file in Notepad' },
  { file: 'main/open-source-file.mts', call: "execute('/usr/bin/open', ['-t'", why: 'opens a source file in a text editor' },
  { file: 'main/serve.mts', call: 'spawn(cmd, [url]', why: 'opens a page in the browser' },
  { file: 'main/demo.mts', call: 'spawnFn(bin, args', why: 'starts a second copy of the app, a window' },
  { file: 'main/fresh-user.mts', call: 'spawnFn(bin, args', why: 'starts a second copy of the app, a window' },
];

const hidesTheWindow = (node: ts.Node | undefined): boolean => !!node && ts.isObjectLiteralExpression(node) && node.properties.some((p) =>
  ts.isPropertyAssignment(p) && p.name.getText() === 'windowsHide' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);

const unwrap = (node: ts.Expression): ts.Expression => (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node);

/** Every call that starts a program, made through child_process or a name that stands for one of its functions. */
function backgroundCalls(src: string, file = 'x.mts') {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>();
  const spaces = new Set<string>();
  const consts = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !/^(node:)?child_process$/.test((st.moduleSpecifier as ts.StringLiteral).text)) continue;
    const bind = st.importClause?.namedBindings;
    if (bind && ts.isNamedImports(bind)) for (const el of bind.elements) { if (!el.isTypeOnly && CALLS.has((el.propertyName ?? el.name).text)) names.add(el.name.text); }
    if (bind && ts.isNamespaceImport(bind)) spaces.add(bind.name.text);
    if (st.importClause?.name) spaces.add(st.importClause.name.text);
  }
  // const { execFile } = await import('node:child_process'), or const cp = await import(...)
  const dynamicImport = (e: ts.Expression): boolean => {
    const x = unwrap(ts.isAwaitExpression(unwrap(e)) ? (unwrap(e) as ts.AwaitExpression).expression : e);
    return ts.isCallExpression(x) && x.expression.kind === ts.SyntaxKind.ImportKeyword
      && x.arguments.length === 1 && ts.isStringLiteral(x.arguments[0]) && /^(node:)?child_process$/.test(x.arguments[0].text);
  };
  const imports = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer && dynamicImport(n.initializer)) {
      if (ts.isIdentifier(n.name)) spaces.add(n.name.text);
      else if (ts.isObjectBindingPattern(n.name)) for (const el of n.name.elements) {
        const from = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : '';
        if (CALLS.has(from) && ts.isIdentifier(el.name)) names.add(el.name.text);
      }
    }
    ts.forEachChild(n, imports);
  };
  imports(sf);
  const startsAProgram = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    if (ts.isIdentifier(x)) return names.has(x.text);
    if (ts.isPropertyAccessExpression(x)) return ts.isIdentifier(x.expression) && spaces.has(x.expression.text) && CALLS.has(x.name.text);
    // promisify(execFile)
    return ts.isCallExpression(x) && x.arguments.length === 1 && startsAProgram(x.arguments[0]);
  };
  // A const, a parameter's default or a destructured default that is one of those functions is one too.
  for (let grew = true; grew;) {
    grew = false;
    const visit = (n: ts.Node) => {
      if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.initializer) {
        if (ts.isVariableDeclaration(n)) consts.set(n.name.text, n.initializer);
        if (!names.has(n.name.text) && startsAProgram(n.initializer)) { names.add(n.name.text); grew = true; }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const found: { call: string; hidden: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && startsAProgram(n.expression) && !(ts.isCallExpression(unwrap(n.expression)))) {
      const hidden = n.arguments.some((a) => hidesTheWindow(a) || (ts.isIdentifier(a) && hidesTheWindow(consts.get(a.text))));
      found.push({ call: n.getText(sf).replace(/\s+/g, ' '), hidden });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function* files(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') yield* files(p); }
    else if (/\.(mts|mjs|cjs|js)$/.test(entry.name)) yield p;
  }
}

describe('a program the app runs in the background never flashes a console on Windows', () => {
  it('finds calls made directly, through an alias, a namespace, promisify or an injected default', () => {
    const src = `
      import { spawn, execFile as run } from 'node:child_process';
      import * as cp from 'child_process';
      import { promisify } from 'node:util';
      const exec = promisify(run);
      function f({ spawnFn = spawn as never } = {}, later = run) {
        spawn('git', ['status'], { stdio: 'pipe' });
        run('git', [], (e) => e);
        cp.execFileSync('ps');
        exec('gh', ['--version']);
        spawnFn('node');
        later('ps', [], { timeout: 1 }, () => {});
      }`;
    expect(backgroundCalls(src).map((c) => [c.call.slice(0, 12), c.hidden])).toEqual([
      ["spawn('git',", false], ["run('git', [", false], ["cp.execFileS", false], ["exec('gh', [", false], ["spawnFn('nod", false], ["later('ps', ", false],
    ]);
  });

  it('finds calls through a child_process loaded with await import()', () => {
    const src = `
      async function poster() {
        const { execFile, spawn: start } = await import('node:child_process');
        const cp = await import('child_process');
        const other = await import('node:fs');
        execFile('ffmpeg', [], { timeout: 1 }, () => {});
        start('git', [], { windowsHide: true });
        cp.spawnSync('ps');
        other.readFileSync('x');
      }`;
    expect(backgroundCalls(src).map((c) => [c.call.slice(0, 12), c.hidden])).toEqual([
      ["execFile('ff", false], ["start('git',", true], ["cp.spawnSync", false],
    ]);
  });

  it('counts windowsHide: true in the call or in a const it is handed, and nothing weaker', () => {
    const src = `
      import { spawn, execFile } from 'node:child_process';
      const opts = { cwd: '/', windowsHide: true };
      const loose = { cwd: '/' };
      spawn('git', [], { stdio: 'ignore', windowsHide: true });
      execFile('git', [], opts, () => {});
      execFile('git', [], loose, () => {});
      spawn('git', [], { windowsHide: false });
      spawn('git', [], { ...opts });`;
    expect(backgroundCalls(src).map((c) => c.hidden)).toEqual([true, true, false, false, false]);
  });

  it('leaves alone a call that is not child_process', () => {
    const src = `
      import { spawn } from 'node-pty';
      const execFile = (a: string) => a;
      spawn('pwsh', [], {});
      execFile('x');
      class C { spawn() {} }`;
    expect(backgroundCalls(src)).toEqual([]);
  });

  it('holds for every file in main/, shared/ and mcp/, and the list of windows is not stale', () => {
    const offenders: string[] = [];
    const used = new Set<(typeof SHOWS_A_WINDOW)[number]>();
    for (const dir of APP) {
      for (const file of files(path.join(root, dir))) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        for (const { call, hidden } of backgroundCalls(fs.readFileSync(file, 'utf8'), file)) {
          const shown = SHOWS_A_WINDOW.find((s) => s.file === rel && call.startsWith(s.call));
          if (shown) used.add(shown);
          else if (!hidden) offenders.push(`${rel}: ${call.slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(SHOWS_A_WINDOW.filter((s) => !used.has(s))).toEqual([]);
  });
});
