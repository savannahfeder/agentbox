// git's own http server behind a sign-in, asked for to push as GitHub asks for
// it, and to fetch as well when `fetchToo` (a private repository).
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

export function gitServer(root: string, { token, fetchToo = false }: { token: string; fetchToo?: boolean }) {
  const backend = path.join(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), 'git-http-backend');
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const pushing = url.searchParams.get('service') === 'git-receive-pack' || url.pathname.endsWith('/git-receive-pack');
    const [user, pass] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':');
    if ((pushing || fetchToo) && !(user === 'x-access-token' && pass === token)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' });
      res.end();
      return;
    }
    const cgi = spawn(backend, [], {
      env: {
        GIT_PROJECT_ROOT: root, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1),
        REQUEST_METHOD: req.method, CONTENT_TYPE: req.headers['content-type'] ?? '', REMOTE_USER: user ?? '', REMOTE_ADDR: '127.0.0.1',
        ...(req.headers['content-encoding'] ? { HTTP_CONTENT_ENCODING: String(req.headers['content-encoding']) } : {}),
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      },
    });
    req.pipe(cgi.stdin);
    let head = Buffer.alloc(0); let sent = false;
    cgi.stdout.on('data', (chunk: Buffer) => {
      if (sent) { res.write(chunk); return; }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      const headers: Record<string, string> = {}; let status = 200;
      for (const line of head.subarray(0, end).toString().split('\r\n')) {
        const [k, ...v] = line.split(':');
        if (k.toLowerCase() === 'status') status = Number.parseInt(v.join(':'), 10); else headers[k] = v.join(':').trim();
      }
      res.writeHead(status, headers);
      res.write(head.subarray(end + 4));
      sent = true;
    });
    cgi.on('close', () => res.end());
  });
}
