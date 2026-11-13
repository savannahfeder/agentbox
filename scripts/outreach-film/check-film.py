# Watches a finished outreach film the way a viewer would, and fails it for the
# faults that reached the founder before any check looked at a finished film:
#   - a screen shown for one or two frames that is unlike what comes before and
#     after (the inbox list between two threads at 0:52; another thread for an
#     instant after the reply to Maya at 1:17; the sidebar opening at 1:31);
#   - a cut that never lands (the switcher sat on screen from 0:04 to 0:10
#     because the recorder got no frame of the app after it closed).
# The face bubble is left out of every comparison; it moves on its own.
#
# usage: python3 check-film.py <film.mp4> [<cuts.json from finish.py>] [--json out.json]
# exits 1 when the film fails, and prints why.
import json, subprocess, sys
import numpy as np

W, H, FPS = 320, 180, 30
BUBBLE = (1744 / 6, 904 / 6, 150 / 6)  # centre and radius in this scale


def frames(path):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-vf', f'fps={FPS},scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, H, W).astype(np.int16)


def flashes(a, keep):
    """Runs of one or two frames far from both neighbours, after a still screen."""
    d = lambda i, j: float(np.abs(a[i] - a[j])[keep].mean())
    step = [d(i, i + 1) for i in range(len(a) - 1)]
    hits = []
    for i in range(2, len(a) - 3):
        for n in (1, 2):
            if n == 2 and step[i] > 1.0:
                continue
            into, outof, across, before = step[i - 1], step[i + n - 1], d(i - 1, i + n), step[i - 2]
            # A frame on the way from one screen to the next is never far from
            # both; a flash is about as far from each side as they are apart.
            if into > 4.4 and outof > 4.4 and across > 4.8 and min(into, outof) / across > 0.6 and before < 1.5:
                hits.append({'t': round(i / FPS, 2), 'frames': n})
                break
    return hits, step


def main():
    args = [x for x in sys.argv[1:]]
    out_json = None
    if '--json' in args:
        k = args.index('--json'); out_json = args[k + 1]; del args[k:k + 2]
    film, cuts_path = args[0], (args[1] if len(args) > 1 else None)
    probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', film],
                                      capture_output=True, text=True, check=True).stdout)
    problems = []
    kinds = [s['codec_type'] for s in probe['streams']]
    if 'audio' not in kinds: problems.append('the film has no sound')
    v = next((s for s in probe['streams'] if s['codec_type'] == 'video'), None)
    if not v or (v['width'], v['height']) != (1920, 1080): problems.append('the film is not 1920x1080')
    dur = float(probe['format']['duration'])
    cuts = json.load(open(cuts_path)) if cuts_path else None
    if cuts and abs(dur - cuts['end']) > 0.25: problems.append(f'the film runs {dur:.2f}s, not {cuts["end"]:.2f}s')

    a = frames(film)
    yy, xx = np.mgrid[0:H, 0:W]
    keep = ((xx - BUBBLE[0]) ** 2 + (yy - BUBBLE[1]) ** 2) > BUBBLE[2] ** 2
    hits, step = flashes(a, keep)
    for h in hits:
        problems.append(f'at {h["t"]:.2f}s a screen shows for {h["frames"]} frame(s) that is unlike the screens on both sides')

    if cuts:
        for c in cuts['cuts']:
            lo, hi = max(0, int((c['t'] - 0.2) * FPS)), min(len(step), int((c['t'] + 0.4) * FPS) + 1)
            if lo >= hi or max(step[lo:hi]) < 1.2:
                problems.append(f'"{c["what"]}" at {c["t"]:.2f}s never changes the screen')

    report = {'film': film, 'duration': round(dur, 2), 'ok': not problems, 'problems': problems}
    if out_json: json.dump(report, open(out_json, 'w'), indent=1)
    print('ok' if not problems else 'FAIL\n' + '\n'.join(f'- {p}' for p in problems))
    sys.exit(0 if not problems else 1)


main()
