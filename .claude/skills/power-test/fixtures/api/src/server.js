import http from 'node:http';
import { list, book, cancel } from './store.js';

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/appointments') return send(res, 200, list({ from: url.searchParams.get('from') }));
  if (req.method === 'POST' && url.pathname === '/appointments') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { send(res, 201, book(JSON.parse(body))); } catch (err) { send(res, 400, { error: err.message }); }
    });
    return;
  }
  const match = /^\/appointments\/(\d+)$/.exec(url.pathname);
  if (req.method === 'DELETE' && match) return send(res, cancel(Number(match[1])) ? 204 : 404, {});
  send(res, 404, { error: 'not found' });
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(Number(process.env.PORT) || 3000);
}
