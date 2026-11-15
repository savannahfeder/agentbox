import json
import pathlib
import sys
import wave
import numpy as np

manifest, sounds, output = sys.argv[1:4]
meta = json.loads(pathlib.Path(manifest).read_text())
SR = 48000

def load(file):
    with wave.open(str(pathlib.Path(sounds) / file)) as audio:
        if audio.getframerate() != SR or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError(f'Expected 48 kHz mono PCM sound: {file}')
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def rms(sample):
    return float(np.sqrt(np.mean(sample[:int(.06 * SR)] ** 2)))

clicks = [load(f'pad{i}.wav') for i in (1, 2, 3)]
clicks = [sample * rms(clicks[0]) / rms(sample) for sample in clicks]
keys = [load(f'key{i}.wav') for i in range(1, 9)]
track = np.zeros(int(meta['T1'] * SR), np.float32)
rng = np.random.default_rng(7)
beats = [(0., 0.)] + [beat for beat in meta['beats'] if beat[0] is not None]
offsets = [0.]
for previous, current in zip(beats, beats[1:]):
    room = .15 * max(0., current[0] - previous[0])
    offsets.append(min(max(current[1] - current[0], offsets[-1] - room), offsets[-1] + room))
grid = np.arange(0., meta['T1'] + 2., .005)
actual = grid + np.interp(grid, [beat[0] for beat in beats], offsets)
for i, event in enumerate(meta['events']):
    if event['kind'] == 'click':
        sample, gain = clicks[i % 3], .3
    elif event['kind'] == 'key':
        sample = keys[rng.integers(0, len(keys))]
        gain = (.1 if event.get('soft') else .26) * rng.uniform(.85, 1.1)
    else:
        raise ValueError(f"Unsupported sound event {event['kind']}")
    start = int(float(np.interp(event['t'], actual, grid)) * SR)
    length = min(len(sample), len(track) - start)
    if start >= 0 and length > 0:
        track[start:start + length] += sample[:length] * gain
with wave.open(output, 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(SR)
    audio.writeframes((np.clip(track, -1, 1) * 32767).astype(np.int16).tobytes())
