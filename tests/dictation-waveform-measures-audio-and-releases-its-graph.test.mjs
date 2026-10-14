// The indicator follows measured audio rather than a decorative timer, and never takes ownership of the microphone tracks.
import {it,expect,vi} from 'vitest';
import {audioLevel,watchAudioLevel} from '../shared/audio-level.mjs';
it('has a quiet baseline and reacts to signal amplitude',()=>{
 expect(audioLevel(new Uint8Array(16).fill(128))).toBe(0);
 expect(audioLevel(new Uint8Array(16).fill(192))).toBeGreaterThan(.4);
});
it('disconnects the graph, cancels frames and closes context without stopping the input stream',()=>{
 let callback;const analyser={fftSize:256,getByteTimeDomainData:vi.fn(a=>a.fill(192)),disconnect:vi.fn()},source={connect:vi.fn(),disconnect:vi.fn()},close=vi.fn().mockResolvedValue();
 class Context{createAnalyser(){return analyser}createMediaStreamSource(){return source}resume(){return Promise.resolve()}close(){return close()}}
 const stream={getTracks:vi.fn()},cancel=vi.fn(),levels=[];
 const stop=watchAudioLevel(stream,n=>levels.push(n),{AudioContext:Context,requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:cancel});
 callback();expect(levels.at(-1)).toBeGreaterThan(.4);stop();stop();expect(close).toHaveBeenCalledTimes(1);expect(source.disconnect).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalled();expect(stream.getTracks).not.toHaveBeenCalled();
});
