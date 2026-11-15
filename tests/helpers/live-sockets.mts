// A WebSocket's client end wired straight to a live room, with each frame
// delivered on a later turn as a real socket would.

export function pairedSockets(room, { dropAfter = Infinity } = {}) {
  const sock = { readyState: 0, binaryType: 'arraybuffer', onopen: null, onmessage: null, onclose: null, onerror: null };
  let sent = 0;
  let seat = null;
  const later = (fn) => setTimeout(fn, 0);
  const shut = () => {
    if (sock.readyState === 3) return;
    sock.readyState = 3;
    seat?.leave();
    later(() => sock.onclose?.({ code: 1000 }));
  };
  sock.send = (bytes) => {
    if (sock.readyState !== 1) throw new Error('not open');
    if (++sent > dropAfter) { shut(); return; }
    const copy = new Uint8Array(bytes);
    later(() => seat?.receive(copy));
  };
  sock.close = shut;
  later(() => {
    seat = room.join({
      send: (bytes) => { const copy = new Uint8Array(bytes); later(() => { if (sock.readyState === 1) sock.onmessage?.({ data: copy.buffer }); }); },
      close: shut,
    });
    sock.readyState = 1;
    sock.onopen?.();
  });
  return sock;
}
