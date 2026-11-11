import collections
import json
import pathlib
import subprocess
import sys
import numpy as np

film, voice, destination = sys.argv[1:4]
out = pathlib.Path(destination)
out.mkdir(parents=True, exist_ok=True)

def run(args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def audio(file):
    return np.frombuffer(run(['ffmpeg', '-v', 'error', '-threads', '2', '-ss', '94', '-i', file, '-t', '2.8', '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']), np.float32)

probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', film]))
video = next(stream for stream in probe['streams'] if stream['codec_type'] == 'video')
decoder = subprocess.Popen(['ffmpeg', '-v', 'error', '-xerror', '-threads', '2', '-i', film, '-vf', 'scale=160:90,format=gray', '-filter_threads', '1', '-an', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
window = collections.deque(maxlen=4)
flashes = []
count = 0
while True:
    data = decoder.stdout.read(160 * 90)
    if not data:
        break
    if len(data) != 160 * 90:
        raise RuntimeError('Truncated frame')
    frame = np.frombuffer(data, np.uint8).astype(np.float32).reshape(90, 160)[:, :130].flatten()
    window.append(frame)
    for length in (1, 2):
        if len(window) < length + 2:
            continue
        before, after = window[-length-2], window[-1]
        sides = float(np.abs(before-after).mean())
        peak = max(min(float(np.abs(before-window[-length-1+i]).mean()), float(np.abs(window[-length-1+i]-after).mean())) for i in range(length))
        if peak > max(3, 2.5 * sides):
            flashes.append({'time': round((count-length)/30, 3), 'frames': length, 'peak': round(peak, 2)})
    count += 1
if decoder.wait() != 0:
    raise RuntimeError('Frame decode failed')
x, y = audio(voice), audio(film)
size = 2**int(np.ceil(np.log2(len(x)+len(y)-1)))
correlation = np.fft.irfft(np.fft.rfft(y, size)*np.fft.rfft(x[::-1], size), size)
lag = int(np.argmax(correlation))-(len(x)-1)
a, b = max(0, lag), max(0, -lag)
length = min(len(y)-a, len(x)-b)
aligned = float(np.corrcoef(y[a:a+length], x[b:b+length])[0, 1])
blocks = y[:len(y)//160*160].reshape(-1, 160)
rms = np.sqrt(np.mean(blocks**2, axis=1))
active = np.flatnonzero(rms > max(float(rms.max())*.025, .0005))
last = 94 + (int(active[-1])+1)*.01 if len(active) else None
report = {'film': film, 'frames': count, 'width': video['width'], 'height': video['height'], 'duration': float(probe['format']['duration']), 'flash_candidates': flashes, 'ending_correlation': aligned, 'ending_alignment_seconds': lag/16000, 'last_voice_activity': last}
(out/'checks.json').write_text(json.dumps(report, indent=2))
for label, time in [('homepage', 1), ('switcher', 4.5), ('home', 7), ('team', 23), ('code', 51), ('headlines', 56), ('maya', 74), ('board', 90), ('ending', 96.4)]:
    run(['ffmpeg', '-v', 'error', '-y', '-threads', '2', '-ss', str(time), '-i', film, '-frames:v', '1', '-q:v', '2', str(out/f'{label}.jpg')])
assert (video['width'], video['height'], count) == (1920, 1080, 2913), report
assert aligned > .95, report
assert last and 96.2 < last < 96.5, report
assert not flashes, report
print(json.dumps(report), flush=True)
