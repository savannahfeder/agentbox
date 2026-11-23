// Git's credential helper for a ship (scripts/ship.mjs).
//
// The token is in a file with no name that only this one git command holds
// open, on fd 3. It is read once and the file emptied, so nothing git starts
// later (the push hook and the branch's tests) finds it there.
import fs from 'node:fs';

const FD = 3;

if (process.argv[2] === 'get') {
  let token = '';
  try {
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(FD, buf, 0, buf.length, 0);
    token = buf.subarray(0, n).toString('utf8').trim();
    fs.ftruncateSync(FD, 0);
  } catch { /* no file: git falls back to asking, and the ship says it could not sign in */ }
  if (token) process.stdout.write(`username=x-access-token\npassword=${token}\n`);
  else process.stderr.write('ship: the GitHub sign-in for this push was already used, so git was given none.\n');
}
