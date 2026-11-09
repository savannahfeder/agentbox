// THE WEB APP'S ADDRESSES FOR A SHARED FILE, on Cloudflare Pages: /f/<token>.
//
// scripts/build-phone-site.mjs writes this file into the site as `_worker.js`,
// with the cloud's public address, its public key and the site's headers put
// in for BAKED, and a `_routes.json` that sends only /f/* here; every other
// address stays a plain file with `_headers`, which Pages does not apply to
// what a worker answers, so the same headers are set here.
//
//   /f/<token>          the app's page, with the file's name in its link-preview tags
//   /f/<token>/raw      the file itself, a page or picture in an origin of its own
//   /f/<token>/preview  a shared picture, for a link preview to show
const BAKED = null;

const PATH = /^\/f\/([A-Za-z0-9_-]{16,64})(?:\/(raw|preview))?\/?$/;
// A link pasted at the end of a sentence carries its full stop or bracket.
const PUNCTUATED = /^\/f\/([A-Za-z0-9_-]{16,64})\/?(?:[.,;:!?)\]}>'"]|%20|%29|%5D|%22|%27)+$/;
const DEADLINE_MS = 4000;
// The page a person shared runs its scripts in an origin of its own, opened
// framed or on its own, so it never reaches the site's storage and the sign-in kept there.
// It may not call a server or post a form: a fake sign-in box inside our page could send what is typed.
const PAGE_CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'; frame-ancestors 'self'";
const PICTURE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'";
const TEXT_CSP = "sandbox; default-src 'none'; frame-ancestors 'self'";
const PDF_CSP = "frame-ancestors 'self'";

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function bytesOf(b64) {
  const raw = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// As the page heads it (renderer/src/shared-file/shared-file.ts titleOf and
// pageTitle): a document by its first heading, a page by its own title.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function pageTitle(html) {
  const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? '').replace(/<svg\b[\s\S]*?<\/svg>/gi, ''))?.[1] ?? '';
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? whole;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
  }).replace(/\s+/g, ' ').trim().slice(0, 120);
}
const isTable = (file) => file.kind === 'markdown' && /^text\/(csv|tab-separated-values)$/i.test(file.type ?? '');
const titleOf = (file) => {
  if (isTable(file)) return file.name;
  if (file.kind === 'markdown') return /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(file.body ?? '')?.[1] ?? String(file.name).replace(/\.(md|markdown)$/i, '');
  if (file.kind === 'page') return pageTitle(file.body) || file.name;
  return file.name;
};

// As renderer/src/shared-file/shared-file.ts filmOf reads it.
const PIECE_DEADLINE_MS = 60_000;
function filmOf(body) {
  try {
    const { pieces, size, hash } = JSON.parse(body);
    return Number.isInteger(pieces) && pieces > 0 && Number.isInteger(size) && /^[0-9a-f]{40}$/.test(hash) ? { pieces, size, hash } : null;
  } catch { return null; }
}

const pictureType = (t) => (/^image\/[a-z0-9.+-]{1,60}$/i.test(t ?? '') ? t : 'application/octet-stream');

export function sharedFileWorker({ cloud, anonKey, headers = {} }, { fetchImpl = (u, i) => fetch(u, i) } = {}) {
  const base = String(cloud).replace(/\/+$/, '');

  async function view(tok) {
    const res = await fetchImpl(`${base}/rest/v1/rpc/file_link_view`, {
      method: 'POST',
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tok }),
      signal: AbortSignal.timeout(DEADLINE_MS),
    });
    if (!res.ok) throw new Error(`the cloud answered ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  const plain = (status, words, extra = {}) => new Response(words, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': TEXT_CSP, 'referrer-policy': 'no-referrer', ...extra },
  });

  function tagsFor(url, tok, file) {
    const page = tok ? `${url.origin}/f/${tok}` : `${url.origin}${url.pathname}`;
    const picture = file?.kind === 'image';
    const title = file ? titleOf(file) : 'Agentbox';
    const name = String(file?.owner_name || 'someone').replace(/\s+/g, ' ').trim();
    const said = file ? `Shared by ${name.length > 60 ? `${name.slice(0, 59)}…` : name} on Agentbox` : 'A file shared on Agentbox';
    const image = picture ? `${page}/preview` : `${url.origin}/phone-icon.png`;
    return [
      ['property', 'og:title', title], ['property', 'og:description', said], ['property', 'og:type', 'website'],
      ['property', 'og:url', page], ['property', 'og:image', image], ['property', 'og:site_name', 'Agentbox'],
      ['name', 'twitter:card', picture ? 'summary_large_image' : 'summary'], ['name', 'twitter:title', title],
      ['name', 'twitter:description', said], ['name', 'twitter:image', image], ['name', 'description', said],
    ].map(([k, n, v]) => `<meta ${k}="${n}" content="${escape(v)}">`).join('\n    ');
  }

  async function thePage(request, env, url, tok) {
    let file = null;
    try { if (tok) file = await view(tok); } catch { /* the page says what became of it */ }
    const shell = await env.ASSETS.fetch(new URL('/', url));
    // The app's files are named from the page's own folder, and this page is two folders down.
    let html = (await shell.text()).replace(/(\s(?:src|href))="\.\//g, '$1="/');
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(file ? `${titleOf(file)} · Agentbox` : 'Agentbox')}</title>`);
    html = html.replace('</head>', `  ${tagsFor(url, tok, file)}\n  </head>`);
    return new Response(request.method === 'HEAD' ? null : html, {
      status: 200,
      headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  async function theFile(request, url, tok, preview) {
    let file;
    try { file = await view(tok); } catch { return plain(502, 'This file did not load. Try again.'); }
    if (!file || (preview && file.kind !== 'image')) return plain(404, 'This link does not work.');
    // A page opened on its own would be somebody's HTML under our address with
    // nothing saying whose: a sign-in look-alike. It opens inside the page that names them.
    if (file.kind === 'page' && request.headers.get('sec-fetch-dest') === 'document') {
      return new Response(null, { status: 302, headers: { location: `${url.origin}/f/${tok}`, 'cache-control': 'no-store' } });
    }
    const shared = { 'cache-control': preview ? 'public, max-age=300' : 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
    if (file.kind === 'page') return new Response(file.body, { headers: { ...shared, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PAGE_CSP } });
    if (isTable(file)) {
      return new Response(file.body, { headers: { ...shared, 'content-type': `${file.type.toLowerCase()}; charset=utf-8`, 'content-security-policy': TEXT_CSP, 'content-disposition': `attachment; filename="${String(file.name).replace(/[^\w.\- ]+/g, '_')}"` } });
    }
    if (file.kind === 'video') {
      const film = filmOf(file.body);
      if (!film) return plain(404, 'This link does not work.');
      let n = 0;
      const pieces = new ReadableStream({
        async pull(out) {
          if (n >= film.pieces) { out.close(); return; }
          const res = await fetchImpl(`${base}/storage/v1/object/link-files/${tok}/${film.hash}/${n++}`, {
            headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
            signal: AbortSignal.timeout(PIECE_DEADLINE_MS),
          });
          if (!res.ok) { out.error(new Error(`a piece answered ${res.status}`)); return; }
          out.enqueue(new Uint8Array(await res.arrayBuffer()));
        },
      });
      return new Response(request.method === 'HEAD' ? null : pieces, { headers: { ...shared, 'content-type': /^video\/[a-z0-9.+-]{1,40}$/i.test(file.type ?? '') ? file.type : 'application/octet-stream', 'content-length': String(film.size), 'content-security-policy': TEXT_CSP, 'content-disposition': `attachment; filename="${String(file.name).replace(/[^\w.\- ]+/g, '_')}"` } });
    }
    if (file.kind === 'markdown') return new Response(file.body, { headers: { ...shared, 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': TEXT_CSP } });
    let bytes;
    try { bytes = bytesOf(file.body); } catch { return plain(404, 'This link does not work.'); }
    if (file.kind === 'pdf') {
      return new Response(bytes, { headers: { ...shared, 'content-type': 'application/pdf', 'content-security-policy': PDF_CSP, 'content-disposition': `inline; filename="${String(file.name).replace(/[^\w.\- ]+/g, '_')}"` } });
    }
    return new Response(bytes, { headers: { ...shared, 'content-type': pictureType(file.type), 'content-security-policy': PICTURE_CSP } });
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/F/')) return new Response(null, { status: 301, headers: { location: `${url.origin}/f/${url.pathname.slice(3)}`, 'cache-control': 'no-store' } });
      const p = PUNCTUATED.exec(url.pathname);
      if (p) return new Response(null, { status: 301, headers: { location: `${url.origin}/f/${p[1]}`, 'cache-control': 'no-store' } });
      const m = PATH.exec(url.pathname);
      // Any other address under /f/ is the page saying the link does not work, its files loaded from the root.
      if (!m) return url.pathname.startsWith('/f/') ? thePage(request, env, url, null) : env.ASSETS.fetch(request);
      if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, 'Not here.', { allow: 'GET, HEAD' });
      const [, tok, part] = m;
      if (!part) return thePage(request, env, url, tok);
      return theFile(request, url, tok, part === 'preview');
    },
  };
}

let made = null;
export default {
  fetch(request, env) {
    if (!BAKED) return new Response('This site was built without its cloud.', { status: 500 });
    made ??= sharedFileWorker(BAKED);
    return made.fetch(request, env);
  },
};
