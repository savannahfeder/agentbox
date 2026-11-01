// KEYS TYPED WHILE ONE WRITE IS ON ITS WAY GO OUT TOGETHER, as the next write.
//
// The panel used to send every key as its own round trip to main, each one
// waiting for the last, so holding Delete built a line of trips that drained
// after she let go. Now the first key goes at once, and whatever she types
// while it travels is one write behind it, in order. A paste still goes in
// pieces main accepts (64 KB is its limit; `chunk` stays well under it).
//
// A write that fails (the shell exited) drops what was waiting behind it: those
// keys were for a shell that is gone, and the failure is reported once.
export function inputQueue(send, { chunk = 16384, onError } = {}) {
  let queued = '', sending = false;
  async function drain() {
    if (sending) return;
    sending = true;
    try {
      while (queued) {
        const data = queued.slice(0, chunk);
        queued = queued.slice(data.length);
        await send(data);
      }
    } catch (e) {
      queued = '';
      onError?.(e);
    } finally {
      sending = false;
    }
  }
  return { push(data) { queued += data; void drain(); } };
}
