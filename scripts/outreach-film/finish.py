# Puts the slowed screen recording back on the voice's clock, moves the camera
# in and out to what she is talking about, adds the clicks and keys as real
# recorded sounds, and lays her bubble and voice on top, in one pass to one
# file. Also writes <out.mp4>.cuts.json: where each of record.mjs's cuts lands
# on the voice's clock, for check-film.py.
#
# usage: python3 finish.py <raw.mp4> <face.mp4> <masks dir> <sfx dir> <out.mp4> --move-at -1 --end <s> [--baked]
#   face.mp4 carries her voice; with --baked it is already a round bubble video.
import json, sys, subprocess, bisect, math, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

raw, face, masks, sfxdir, out = sys.argv[1:6]
BAKED = '--baked' in sys.argv
# Her bubble slides from bottom left to bottom right at this voice time (the team part).
MOVE = float(sys.argv[sys.argv.index('--move-at') + 1]) if '--move-at' in sys.argv else 1e9
meta = json.load(open(raw + '.json'))
T1 = float(sys.argv[sys.argv.index('--end') + 1]) if '--end' in sys.argv else meta['T1']; times = meta['times']; W, H = meta['W'], meta['H']
RW, RH = 2880, 1620          # the recording
OW, OH, FPS = 1920, 1080, 30  # the film
S = 280                       # bubble size
BX, BY = 36, OH - 36 - S      # bubble corner
beats = [(0.0, 0.0)] + [tuple(b) for b in meta['beats'] if b[0] is not None]  # a cue the words lacked has no moment
# Offsets of the recording from her voice at each beat, followed at a slope of
# at most 0.15: a late beat is caught up slowly instead of fast-forwarded.
_bt = [b[0] for b in beats]; _bo = [0.0]
for (t0, a0), (t1, a1) in zip(beats, beats[1:]):
    room = 0.15 * max(0.0, t1 - t0)
    _bo.append(min(max(a1 - t1, _bo[-1] - room), _bo[-1] + room))
def actual(t):
    """Recording moment shown at voice time t."""
    return t + float(np.interp(t, _bt, _bo))
_grid = np.arange(0.0, T1 + 2.0, 0.005)
_gact = np.array([actual(t) for t in _grid])
def voice(a):
    """Voice time at which recording moment a shows."""
    return float(np.interp(a, _gact, _grid))

# ---- the camera: crop rectangles in recording CSS px, eased edge by edge ----
FULL = (0.0, 0.0, float(W), float(H))
XR = OW - 36 - S
BUB_L = (BX - 14, BY - 14, BX + S + 14, BY + S + 14)  # in film px
BUB_R = (XR - 14, BY - 14, XR + S + 14, BY + S + 14)

def target(ev):
    if ev['rect'] is None: return FULL
    l, t, w, h = ev['rect']
    s = ev.get('scale') or min(2.0, 0.8 * W / w, 0.8 * H / h)
    s = max(1.0, min(s, 0.94 * W / w, 0.94 * H / h, 2.2))
    cw, ch = W / s, H / s
    clampx = lambda c: min(max(c, cw / 2), W - cw / 2)
    clampy = lambda c: min(max(c, ch / 2), H - ch / 2)
    cx, cy = clampx(l + w / 2), clampy(t + h / 2)
    box = BUB_R if voice(ev['t']) >= MOVE else BUB_L
    # Keep what she is talking about out from under her bubble, but only by a
    # move that keeps all of it in the picture.
    def proj(cx, cy):
        kx, ky = OW / cw, OH / ch
        return ((l - (cx - cw / 2)) * kx, (t - (cy - ch / 2)) * ky, (l + w - (cx - cw / 2)) * kx, (t + h - (cy - ch / 2)) * ky)
    def under(cx, cy):
        a = proj(cx, cy)
        return a[0] < box[2] and a[2] > box[0] and a[3] > box[1] and a[1] < box[3]
    def inside(x, y):
        return l >= x - cw / 2 - 1 and l + w <= x + cw / 2 + 1 and t >= y - ch / 2 - 1 and t + h <= y + ch / 2 + 1
    if under(cx, cy):
        a = proj(cx, cy)
        dx = (box[2] + 12 - a[0]) if box is BUB_L else -(a[2] - (box[0] - 12))  # film px the content moves
        dy = -(a[3] - (box[1] - 12))
        tries = [(clampx(cx - dx * cw / OW), cy), (cx, clampy(cy - dy * ch / OH))]
        ok = [(abs(x - cx) + abs(y - cy), x, y) for x, y in tries if not under(x, y) and inside(x, y)]
        if ok: _, cx, cy = min(ok)
    return (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)

ease = lambda u: u * u * (3 - 2 * u) if u < 1 else 1.0
def smoother(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * u * (u * (u * 6 - 15) + 10)
segs = []
cam = FULL
for ev in sorted(meta['camera'], key=lambda e: e['t']):
    segs.append(ev)
def camera_at(a):
    c, start, seg = FULL, FULL, None
    for ev in segs:
        if ev['t'] > a: break
        # the camera where this move begins
        if seg is not None:
            u = smoother((ev['t'] - seg['t']) / seg['dur'])
            c = tuple(s0 + (s1 - s0) * u for s0, s1 in zip(seg['from'], seg['to']))
        seg = {'t': ev['t'], 'dur': ev['dur'], 'from': c, 'to': target(ev)}
    if seg is None: return FULL
    u = smoother((a - seg['t']) / seg['dur'])
    return tuple(s0 + (s1 - s0) * u for s0, s1 in zip(seg['from'], seg['to']))

# ---- the keys she presses, shown as keycaps ----
try: FONT = ImageFont.truetype(os.path.expanduser('~/.fonts/SF-Pro-Text-Medium.otf'), 30)
except OSError: FONT = ImageFont.load_default()  # only the keycaps use it, and the film shows none
def caps(label):
    toks = label.replace('↵', '⏎').split(' ')  # SF Pro has no ↵ or ↩
    pad, gap, hgt = 18, 10, 58
    widths = [max(hgt, int(FONT.getlength(t)) + 2 * pad) for t in toks]
    im = Image.new('RGBA', (sum(widths) + gap * (len(toks) - 1) + 8, hgt + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = 4
    for t, w in zip(toks, widths):
        d.rounded_rectangle((x, 4, x + w, 4 + hgt), radius=4, fill=(24, 24, 27, 214), outline=(255, 255, 255, 40), width=1)
        tw = FONT.getlength(t)
        d.text((x + (w - tw) / 2, 4 + 11), t, font=FONT, fill=(242, 242, 242, 255))
        x += w + gap
    return np.array(im)
pill_imgs = {}
pills = []
for p in meta['pills']:
    if p['label'] not in pill_imgs: pill_imgs[p['label']] = caps(p['label'])
    pills.append((voice(p['t']), p['label']))
def draw_pills(frame, t):
    for (tp, label) in pills:
        dt = t - tp
        if dt < -0.02 or dt > 1.15: continue
        a = min(1.0, (dt + 0.02) / 0.08) * (1.0 if dt < 0.85 else max(0.0, 1 - (dt - 0.85) / 0.3))
        im = pill_imgs[label]; h, w = im.shape[:2]
        x0, y0 = (OW - w) // 2, OH - 64 - h
        roi = frame[y0:y0 + h, x0:x0 + w].astype(np.float32)
        al = im[:, :, 3:4].astype(np.float32) / 255 * a
        rgb = im[:, :, 2::-1].astype(np.float32)  # RGBA -> BGR
        frame[y0:y0 + h, x0:x0 + w] = (roi * (1 - al) + rgb * al).astype(np.uint8)

# ---- the sounds of the hand: recorded clicks and keys ----
SR = 48000
def load(f):
    import wave
    w = wave.open(f); return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
def rms(a): return float(np.sqrt(np.mean(a[: int(0.06 * SR)] ** 2)))
clicks = [load(f'{sfxdir}/pad{i}.wav') for i in (1, 2, 3)]  # a trackpad's click
clicks = [c * (rms(clicks[0]) / rms(c)) for c in clicks]       # every click the same loudness
import glob
keys = [load(f) for f in sorted(glob.glob(f'{sfxdir}/key*.wav'))]
if not keys: sys.exit(f'no key sounds (key1.wav ...) in {sfxdir}')
typing = load(f'{sfxdir}/typing.wav')[int(17.7 * SR):int(20.7 * SR)] if os.path.exists(f'{sfxdir}/typing.wav') else None
track = np.zeros(int((T1 + 1) * SR), np.float32)
rng = np.random.default_rng(7)
def put(sample, t, g):
    k = int(t * SR); n = min(len(sample), len(track) - k)
    if k >= 0 and n > 0: track[k:k + n] += sample[:n] * g
for i, ev in enumerate(meta['events']):
    t = voice(ev['t'])
    if ev['kind'] == 'click': put(clicks[i % 3], t, 0.3)
    elif ev['kind'] == 'typing' and typing is not None:
        d = max(0.2, voice(ev['until']) - t); seg = typing[: int(d * SR)].copy()
        f = min(len(seg) // 4, int(0.03 * SR)); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        put(seg, t, 0.22)
    else: put(keys[rng.integers(0, len(keys))], t, (0.1 if ev.get('soft') else 0.26) * rng.uniform(0.85, 1.1))  # typing quieter than a single key
sfx_wav = out + '.sfx.wav'
import wave
w = wave.open(sfx_wav, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(track, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()

# ---- frames ----
# A screen the app shows for a moment between two others (pressing 1 drew the
# inbox list for one paint before the next thread) lasts a fifth as long on the
# slowed page as it would in life, but still lands on a frame and reads as a
# flash. A run of up to three frames, gone within 0.07 s, unlike what came
# before and after while those two are much like each other, is replaced by
# the frame before it.
def flashes():
    sw, sh = 160, 90
    p = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', raw, '-vf', f'scale={sw}:{sh},format=gray', '-f', 'rawvideo', '-'], capture_output=True)
    a = np.frombuffer(p.stdout, np.uint8)
    n = len(a) // (sw * sh)
    a = a[: n * sw * sh].reshape(n, sh, sw).astype(np.float32)
    d = lambda i, j: float(np.abs(a[i] - a[j]).mean())
    bad = set()
    for i in range(1, n - 1):
        if i in bad: continue
        for k in (1, 2, 3):
            if i + k >= n or times[i + k] - times[i] > 0.07: break
            ab = d(i - 1, i + k)
            # A frame part way from one screen to the next is never far from
            # both; a flash is, by much more than the two screens differ.
            peak = max(min(d(i - 1, i + j), d(i + j, i + k)) for j in range(k))
            if peak > max(3.0, 2.5 * ab):
                bad.update(range(i, i + k))
                print(f'flash: frames {i}..{i + k - 1} at {times[i]:.3f}s, {peak:.1f} from both sides, sides {ab:.1f} apart', file=sys.stderr)
                break
    return bad
bad = flashes()
def good(p):
    while p > 0 and p in bad: p -= 1
    return p
n_out = int(round(T1 * FPS))
picks = [good(max(0, bisect.bisect_right(times, actual(k / FPS) + 1e-4) - 1)) for k in range(n_out)]
late = [round(a - t, 2) for t, a in beats if a - t > 0.25]
print('largest lag kept', round(max(a - t - float(np.interp(t, _bt, _bo)) for t, a in beats), 2), file=sys.stderr)
print(f'{len(times)} frames recorded, {n_out} out, {len(set(picks))} distinct; late beats: {late}', file=sys.stderr)
# Where each cut lands on the voice's clock, for check-film.py.
json.dump({'end': T1, 'cuts': [{'t': round(voice(c['t']), 3), 'what': c['what']} for c in meta.get('cuts', [])],
           'flashesRemoved': sorted(round(times[i], 3) for i in bad)}, open(out + '.cuts.json', 'w'), indent=1)

FRAME = RW * RH * 3
VDUR = float(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', face], capture_output=True, text=True).stdout.strip() or T1)
dec = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', raw, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE, bufsize=FRAME * 2)
if BAKED:
    face_graph = f'[1:v]tpad=stop_mode=clone:stop_duration=5,scale={S}:{S},format=rgba[f0];[3:v]format=gray,scale={S}:{S}[cm];[f0][cm]alphamerge[face];'
else:
    face_graph = (f'[1:v]tpad=stop_mode=clone:stop_duration=5,format=yuv420p,split=2[a][b];[a]gblur=sigma=10[bg];[2:v]format=gray,scale=520:520[pm];[b][pm]alphamerge[fg];'
                  f'[bg][fg]overlay=format=auto,eq=contrast=1.05:saturation=1.08:brightness=0.01,scale={S}:{S}:flags=lanczos,format=rgba[f0];'
                  f'[3:v]format=gray[cm];[f0][cm]alphamerge[face];')
bx = f'if(lt(t,{MOVE}),{BX},if(gt(t,{MOVE + 0.6}),{XR},{BX}+{XR - BX}*(0.5-0.5*cos(PI*(t-{MOVE})/0.6))))'
graph = (face_graph +
         f"[0:v][4:v]overlay=x='{bx}-40':y={BY - 40}[s1];[s1][face]overlay=x='{bx}':y={BY}:shortest=1,format=yuv420p[v];"
         f'[1:a]aresample=48000,pan=mono|c0=c0,afade=t=out:st={VDUR - 0.25}:d=0.25,apad=pad_dur=5[vo];[5:a]aresample=48000[fx];[vo][fx]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-22:TP=-1.5:LRA=11,aresample=48000,pan=stereo|c0=c0|c1=c0,afade=t=out:st={T1 - 0.35}:d=0.35[au]')
enc = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', 'pipe:0',
    '-i', face, '-loop', '1', '-i', f'{masks}/person.png', '-loop', '1', '-i', f'{masks}/circle.png', '-loop', '1', '-i', f'{masks}/shadow.png', '-i', sfx_wav,
    '-filter_complex', graph, '-map', '[v]', '-map', '[au]', '-t', str(T1),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', os.environ.get('CRF', '18'), '-pix_fmt', 'yuv420p', '-r', str(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], stdin=subprocess.PIPE)

cur, buf = -1, None
for k, p in enumerate(picks):
    while cur < p:
        nxt = dec.stdout.read(FRAME)
        if len(nxt) < FRAME: break
        buf, cur = nxt, cur + 1
    img = np.frombuffer(buf, np.uint8).reshape(RH, RW, 3)
    l, t, r, b = camera_at(actual(k / FPS))
    sx = RW / W
    x0, y0, x1, y1 = l * sx, t * sx, r * sx, b * sx
    cw, ch = x1 - x0, y1 - y0
    if cw >= RW - 0.5:
        frame = cv2.resize(img, (OW, OH), interpolation=cv2.INTER_AREA)
    else:
        # Sub-pixel crop through an affine warp, so slow moves never step.
        M = np.array([[OW / cw, 0, -x0 * OW / cw], [0, OH / ch, -y0 * OH / ch]], np.float32)
        frame = cv2.warpAffine(img, M, (OW, OH), flags=cv2.INTER_AREA if cw > OW else cv2.INTER_CUBIC)
    frame = np.ascontiguousarray(frame)
    draw_pills(frame, k / FPS)
    try:
        enc.stdin.write(frame.tobytes())
    except BrokenPipeError:
        break
try: enc.stdin.close()
except BrokenPipeError: pass
dec.stdout.close(); dec.kill(); dec.wait()
sys.exit(enc.wait())
