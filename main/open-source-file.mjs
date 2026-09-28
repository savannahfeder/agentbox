import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const run = promisify(execFile);
export async function openSourceFile(file, execute = run) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw Error('Resolve the source file before opening it.');
  await execute('/usr/bin/open', ['-t', file], {timeout:10000});
}
