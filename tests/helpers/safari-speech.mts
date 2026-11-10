// A stand-in for Safari's webkitSpeechRecognition, to put in a page before the
// app loads. Shaped on WebKit's source: WebCore/Modules/speech/SpeechRecognition.cpp
// (each result list is every final so far plus the new ones, resultIndex at the
// first new one) and WebSpeechRecognizerTask.mm (speechstart comes with the
// first words, stop() ends on a final then end, abort() ends on "aborted").
// `deaf` is bugs.webkit.org/show_bug.cgi?id=321436: on iOS 27.2 a recogniser
// that starts at once and never hears a word.
//
// The page gets window.__speech: say(words) speaks to the live recogniser the
// way Safari hears it, a word at a time and then final.
export const SAFARI_SPEECH = `(() => {
  const all = [];
  const mode = { deaf: false, startMs: 200 };
  let live = null;
  class Rec {
    constructor() { this.state = 'inactive'; this.finals = []; this.interim = ''; this.calls = []; all.push(this); }
    fire(type, init = {}) { const h = this['on' + type]; if (typeof h === 'function') h.call(this, Object.assign(new Event(type), init)); }
    start() {
      this.calls.push('start');
      if (this.state !== 'inactive') throw new DOMException('Recognition is being started or already started', 'InvalidStateError');
      this.deaf = mode.deaf;
      this.state = 'starting';
      setTimeout(() => { if (this.state !== 'starting') return; this.state = 'listening'; live = this; this.fire('start'); this.fire('audiostart'); }, this.deaf ? 40 : mode.startMs);
    }
    list(fresh) {
      const results = [...this.finals, ...fresh].map(([t, isFinal]) => Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal }));
      return { resultIndex: this.finals.length, results };
    }
    hear(t, final) {
      if (this.state !== 'listening' || this.deaf) return false;
      if (!this.spoke) { this.spoke = true; this.fire('speechstart'); }
      if (final) { const e = this.list([[t, true]]); this.finals.push([t, true]); this.interim = ''; this.fire('result', e); }
      else { this.interim = t; this.fire('result', this.list([[t, false]])); }
      return true;
    }
    end(error) {
      if (this.state === 'inactive') return;
      if (this.spoke) this.fire('speechend');
      this.state = 'inactive';
      if (live === this) live = null;
      if (error) this.fire('error', error);
      this.fire('end');
    }
    stop() {
      this.calls.push('stop');
      if (this.state === 'inactive' || this.state === 'stopping') return;
      const was = this.state;
      this.state = 'stopping';
      setTimeout(() => {
        if (this.deaf || was === 'starting') return this.end({ error: 'aborted', message: 'No speech detected' });
        if (this.interim) { const e = this.list([[this.interim, true]]); this.finals.push([this.interim, true]); this.interim = ''; this.fire('result', e); }
        this.end();
      }, 60);
    }
    abort() {
      this.calls.push('abort');
      if (this.state === 'inactive') return;
      this.state = 'aborting';
      setTimeout(() => this.end({ error: 'aborted', message: 'No speech detected' }), 10);
    }
  }
  window.webkitSpeechRecognition = Rec;
  window.SpeechRecognition = Rec;
  window.__speech = {
    all, mode,
    get live() { return live; },
    async say(sentence, { final = true } = {}) {
      const words = sentence.split(' ');
      let heard = false;
      for (let i = 1; i <= words.length; i += 1) {
        if (live && live.hear(words.slice(0, i).join(' '), false)) heard = true;
        await new Promise((r) => setTimeout(r, 30));
      }
      if (final && live) live.hear(sentence, true);
      return heard;
    },
  };
})();`;
