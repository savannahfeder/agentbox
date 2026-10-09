// A LOCAL APP SHOWS IN THE PANE AND STAYS SIGNED IN.
//
// The pane draws an address like http://localhost:3006 in a frame, because a
// frame keeps every shortcut the app answers from inside a page (the
// before-input-event handler in main.mjs hears a frame; it would not hear a
// webview's guest). Two things a local app commonly sends broke that frame:
//
//   X-Frame-Options / CSP frame-ancestors   Chromium refuses to draw the page
//                                           at all, so the pane sat blank.
//                                           Next.js apps send both.
//   a SameSite=Lax sign-in cookie            the window is a file:// page, so
//                                           the app in it is cross-site and the
//                                           cookie is refused: sign-in loops.
//
// Both are rewritten here, below the page, for local addresses only and only
// inside the app's own window. Framing protection exists to stop another site
// drawing yours under a stranger's pointer; the app drawing her own dev server
// for her is not that. tests/a-local-app-shows-in-the-pane-and-stays-signed-in.test.mjs

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalAddress(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname);
  } catch { return false; }
}

const keyOf = (headers, name) => Object.keys(headers).find((k) => k.toLowerCase() === name);

function withoutFrameAncestors(policy) {
  return policy.split(';').map((d) => d.trim()).filter((d) => d && !/^frame-ancestors(\s|$)/i.test(d)).join('; ');
}

// SameSite=None needs Secure, and Chromium takes Secure from http://localhost
// because it counts loopback as a secure origin.
function sentInsideTheWindow(cookie) {
  const parts = cookie.split(';').map((p) => p.trim());
  if (parts.some((p) => /^samesite\s*=\s*none$/i.test(p))) return cookie;
  const kept = parts.filter((p) => !/^samesite\s*=/i.test(p));
  if (!kept.some((p) => /^secure$/i.test(p))) kept.push('SameSite=None', 'Secure');
  else kept.push('SameSite=None');
  return kept.join('; ');
}

/**
 * The headers a local app's response should carry inside the pane, or null
 * when nothing changes. `details` is Electron's onHeadersReceived details.
 */
export function localAppHeaders({ url, resourceType, responseHeaders }) {
  if (!responseHeaders || resourceType === 'mainFrame' || !isLocalAddress(url)) return null;
  const out = { ...responseHeaders };
  let changed = false;
  if (resourceType === 'subFrame') {
    const xfo = keyOf(out, 'x-frame-options');
    if (xfo) { delete out[xfo]; changed = true; }
    const csp = keyOf(out, 'content-security-policy');
    if (csp) {
      const policies = out[csp].map(withoutFrameAncestors).filter(Boolean);
      if (policies.join() !== out[csp].join()) {
        changed = true;
        if (policies.length) out[csp] = policies; else delete out[csp];
      }
    }
  }
  const cookies = keyOf(out, 'set-cookie');
  if (cookies) {
    const next = out[cookies].map(sentInsideTheWindow);
    if (next.join('\n') !== out[cookies].join('\n')) { out[cookies] = next; changed = true; }
  }
  return changed ? out : null;
}

/** Wire it to the window's own session, for that window's requests only. */
export function letLocalAppsShowInThePane(contents) {
  const filter = { urls: ['*://localhost/*', '*://127.0.0.1/*', '*://[::1]/*'] };
  contents.session.webRequest.onHeadersReceived(filter, (details, callback) => {
    const ours = details.webContentsId === contents.id;
    const responseHeaders = ours ? localAppHeaders(details) : null;
    callback(responseHeaders ? { responseHeaders } : {});
  });
}
