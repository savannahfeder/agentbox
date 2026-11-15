// A CLOUD AGENT'S SIGN-IN SENDS THE BROWSER BACK TO "localhost", WHICH IS THIS
// COMPUTER, NOT THE CLOUD MACHINE WAITING FOR IT. While such a sign-in is open
// on a cloud thread, this computer listens at that address, takes the browser's
// return, and hands its address to the agent as the person's answer
// (shared/sign-in-ask.mts), which gives it to the login on its own machine.
// A run on this computer needs none of this: its login is listening itself.
import http from 'node:http';
import { comesBackTo } from '../shared/sign-in-ask.mts';
import { Name } from '../shared/product-name.mjs';

export interface OpenReturn { product: string; id: string; ask: string; url: string }

const PAGE = `<!doctype html><meta charset="utf-8"><title>Signed in</title><body style="font:16px system-ui;margin:20vh auto;max-width:28em;text-align:center">Signed in. You can close this tab and go back to ${Name}.</body>`;

// No clock of its own: the card is up until the run that asked ends
// (Supervisor._closeSignInItWaitedOn), and a person gets to it whenever they do.
export class SignInReturns {
  declare open: Map<string, { servers: http.Server[] }>;
  declare caught: Set<string>;
  declare busy: Set<string>;
  declare answer: (r: OpenReturn, landed: string) => void;
  declare log: { warn?: (...a: unknown[]) => void };

  constructor({ answer, log = console }: { answer: (r: OpenReturn, landed: string) => void; log?: { warn?: (...a: unknown[]) => void } }) {
    this.open = new Map();
    this.caught = new Set();
    this.busy = new Set();
    this.answer = answer;
    this.log = log;
  }

  /** Listens for each of these that comes back to localhost, and stops for the rest. Called every pass, so a stop or a busy port is tried again. */
  sync(asks: OpenReturn[]) {
    const wanted = new Map(asks.map((a) => [a.ask, a]));
    for (const ask of [...this.open.keys()]) if (!wanted.has(ask)) this.stop(ask);
    for (const a of wanted.values()) if (!this.open.has(a.ask) && !this.caught.has(a.ask)) this.listen(a);
  }

  listen(a: OpenReturn) {
    const back = comesBackTo(a.url);
    if (!back) return;
    const servers: http.Server[] = [];
    const take = (req: http.IncomingMessage, res: http.ServerResponse) => {
      const landed = `http://localhost:${back.port}${req.url ?? '/'}`;
      if (new URL(landed).pathname !== back.path) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }).end(PAGE);
      try { this.answer(a, landed); } catch (e) { this.log.warn?.('zero: a sign-in came back and could not be handed on:', (e as Error).message); }
      this.caught.add(a.ask);
      this.stop(a.ask);
    };
    // Both, because a browser may try either for "localhost". One already taken
    // is somebody else's listener, left to them; 127.0.0.1 is the one a link
    // names, so without it the next pass tries again.
    for (const host of ['127.0.0.1', '::1']) {
      const server = http.createServer(take);
      server.on('error', (e: NodeJS.ErrnoException) => {
        server.close();
        if (host !== '127.0.0.1' || this.open.get(a.ask)?.servers !== servers) return;
        if (!this.busy.has(a.ask)) this.log.warn?.(`zero: could not listen for a sign-in's return at 127.0.0.1:${back.port}, trying again:`, e.code ?? e.message);
        this.busy.add(a.ask);
        this.stop(a.ask);
      });
      server.listen(back.port, host);
      servers.push(server);
    }
    this.open.set(a.ask, { servers });
  }

  stop(ask: string) {
    const held = this.open.get(ask);
    if (!held) return;
    for (const s of held.servers) { s.close(); s.closeAllConnections(); }
    this.open.delete(ask);
  }

  stopAll() { for (const ask of [...this.open.keys()]) this.stop(ask); }
}
